import { isValidElementNesting, ELEMENT_HIERARCHY } from './element-model'
import { validateJmxSyntax as checkJmxSyntax } from './serializer'

// ============================================================================
// Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationMessage {
  severity: ValidationSeverity
  ruleId: string
  element?: string
  message: string
  remediation?: string
}

export interface ValidationReport {
  valid: boolean
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
  info: ValidationMessage[]
}

// ============================================================================
// JMX element tag ↔ testclass alias derivation
// ============================================================================

/**
 * Derives valid tag aliases from ELEMENT_HIERARCHY keys.
 * Each hierarchy key is a valid testclass whose XML tag matches the key name.
 * ConfigTestElement is a special case: its JMX tag name is "ConfigTestElement"
 * but its testclass is the fully-qualified "org.apache.jmeter.config.ConfigTestElement".
 */
function deriveTagAliases(): Record<string, string[]> {
  const aliases: Record<string, string[]> = {}
  for (const key of Object.keys(ELEMENT_HIERARCHY)) {
    aliases[key] = [key]
  }
  aliases['org.apache.jmeter.config.ConfigTestElement'] = ['ConfigTestElement']
  return aliases
}

const VALID_TAG_ALIASES = deriveTagAliases()

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

const TIMER_TAG_SET = new Set([
  'ConstantTimer',
  'UniformRandomTimer',
  'PreciseThroughputTimer',
  'PoissonRandomTimer',
  'GaussianRandomTimer',
  'ConstantThroughputTimer',
  'SynchronizingTimer',
])

const ASSERTION_TAG_SET = new Set([
  'ResponseAssertion',
  'DurationAssertion',
  'SizeAssertion',
  'XMLAssertion',
  'HTMLAssertion',
  'XPathAssertion',
  'JMESAssertion',
  'JSONAssertion',
  'MD5HexAssertion',
  'BeanShellAssertion',
  'JSR223Assertion',
  'Assertion',
])

// ============================================================================
// Low-level DOM helpers
// ============================================================================

function queryAll(doc: Document, tagName: string): Element[] {
  return Array.from(doc.getElementsByTagName(tagName))
}

function getStringProp(parent: Element, name: string): string {
  const el = parent.querySelector(`stringProp[name="${name}"]`)
  return el?.textContent?.trim() ?? ''
}

function getIntProp(parent: Element, name: string): number {
  const raw = getStringProp(parent, name)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : NaN
}

// ============================================================================
// Syntax Layer
// ============================================================================

function syntaxErrorMessages(error: string): ValidationMessage[] {
  return [
    {
      severity: 'error',
      ruleId: 'malformed-xml',
      message: `Malformed XML: ${error}`,
      remediation: 'Fix XML well-formedness before import.',
    },
  ]
}

function validateJmxSyntaxToMessages(jmx: string): ValidationMessage[] {
  const error = checkJmxSyntax(jmx)
  if (error !== undefined) {
    return syntaxErrorMessages(error)
  }
  return []
}

// ============================================================================
// Structural Layer
// ============================================================================

interface StructuralContext {
  messages: ValidationMessage[]
  threadGroups: Element[]
  samplers: Element[]
  csvDataSets: Element[]
}

export function validateJmxStructure(doc: Document): ValidationMessage[] {
  const ctx: StructuralContext = {
    messages: [],
    threadGroups: [],
    samplers: [],
    csvDataSets: [],
  }

  checkRootElements(doc, ctx)
  checkNesting(doc, ctx)
  checkThreadGroupProperties(ctx)
  checkSamplerProperties(ctx)
  checkCsvDataSetProperties(ctx)

  return ctx.messages
}

function checkRootElements(_doc: Document, ctx: StructuralContext): void {
  const threadGroups = queryAll(_doc, 'ThreadGroup')
  if (threadGroups.length === 0) {
    ctx.messages.push({
      severity: 'error',
      ruleId: 'missing-threadgroup',
      element: 'ThreadGroup',
      message: 'At least one <ThreadGroup> is required inside <TestPlan>.',
      remediation: 'Add a <ThreadGroup> under <TestPlan>.',
    })
  } else {
    ctx.threadGroups = threadGroups
  }
}

function checkNesting(doc: Document, ctx: StructuralContext): void {
  const root = doc.documentElement
  if (root.tagName === 'jmeterTestPlan') {
    walkForNesting(root, null, ctx)
  }
}

/**
 * Walks the JMX DOM tree, treating each <hashTree> as the container for
 * the logical children of the preceding non-hashTree element (or of
 * `parentType` when the hashTree is a direct child).
 *
 * Uses index-based iteration and an explicit skip so each sibling
 * hashTree is processed exactly once: either as `el.nextElementSibling`
 * (carrying `tagName` as the parentType) or as a direct child of `node`
 * (carrying `parentType`). Never both.
 */
function walkForNesting(node: Element, parentType: string | null, ctx: StructuralContext): void {
  const children = Array.from(node.children)
  let i = 0

  while (i < children.length) {
    const el = children[i]!
    const tagName = el.tagName

    if (tagName === 'hashTree') {
      walkForNesting(el, parentType, ctx)
      i += 1
      continue
    }

    const testClass = el.getAttribute('testclass')
    if (testClass !== null) {
      if (parentType !== null && !isValidElementNesting(parentType, tagName)) {
        const validChildren = ELEMENT_HIERARCHY[parentType] ?? []
        ctx.messages.push({
          severity: 'error',
          ruleId: 'invalid-nesting',
          element: tagName,
          message: `<${tagName}> is not a valid child of <${parentType}>.`,
          remediation:
            validChildren.length > 0
              ? `Valid children of <${parentType}> are: ${validChildren.join(', ')}`
              : `<${parentType}> cannot have child elements.`,
        })
      }

      if (tagName === 'HTTPSamplerProxy') {
        ctx.samplers.push(el)
      }

      if (tagName === 'CSVDataSet') {
        ctx.csvDataSets.push(el)
      }
    }

    const next = children[i + 1]
    if (next !== undefined && next.tagName === 'hashTree') {
      const childParentType = testClass !== null ? tagName : parentType
      walkForNesting(next, childParentType, ctx)
      i += 2
      continue
    }

    i += 1
  }
}

function checkThreadGroupProperties(ctx: StructuralContext): void {
  for (const tg of ctx.threadGroups) {
    const numThreads = getIntProp(tg, 'ThreadGroup.num_threads')
    if (!Number.isFinite(numThreads) || numThreads <= 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'invalid-threads',
        element: 'ThreadGroup',
        message: 'ThreadGroup.num_threads must be a positive integer.',
        remediation: 'Set ThreadGroup.num_threads to a value greater than 0.',
      })
    }

    const rampTime = getIntProp(tg, 'ThreadGroup.ramp_time')
    if (!Number.isFinite(rampTime) || rampTime < 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'invalid-ramp-time',
        element: 'ThreadGroup',
        message: 'ThreadGroup.ramp_time must be a non-negative integer.',
        remediation: 'Set ThreadGroup.ramp_time to 0 or a positive integer.',
      })
    }
  }
}

function checkSamplerProperties(ctx: StructuralContext): void {
  for (const sampler of ctx.samplers) {
    const path = getStringProp(sampler, 'HTTPSampler.path')
    if (path.length === 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'missing-path',
        element: 'HTTPSamplerProxy',
        message: 'HTTPSamplerProxy has an empty path.',
        remediation: 'Set HTTPSampler.path to a non-empty request path.',
      })
    }

    const method = getStringProp(sampler, 'HTTPSampler.method')
    if (method.length === 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'missing-method',
        element: 'HTTPSamplerProxy',
        message: 'HTTPSamplerProxy has an empty method.',
        remediation: 'Set HTTPSampler.method to GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.',
      })
    }
  }
}

function checkCsvDataSetProperties(ctx: StructuralContext): void {
  for (const csv of ctx.csvDataSets) {
    const filename = getStringProp(csv, 'filename')
    if (filename.length === 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'missing-csv-filename',
        element: 'CSVDataSet',
        message: 'CSVDataSet exists but filename is empty.',
        remediation: 'Set the filename property on CSVDataSet or remove the element.',
      })
    }
  }
}

// ============================================================================
// Semantic / Best-Practice Layer
// ============================================================================

interface SemanticContext {
  messages: ValidationMessage[]
}

export function validateJmxSemantics(doc: Document): ValidationMessage[] {
  const ctx: SemanticContext = { messages: [] }

  checkEmptyPlanName(doc, ctx)
  checkZeroThreads(doc, ctx)
  checkHighThreadCount(doc, ctx)
  checkUnknownMethod(doc, ctx)
  checkMissingDomainProtocol(doc, ctx)
  checkDeprecatedTag(doc, ctx)
  checkNoAssertions(doc, ctx)
  checkNoThinkTime(doc, ctx)
  checkHighLoopCount(doc, ctx)

  return ctx.messages
}

function checkEmptyPlanName(doc: Document, ctx: SemanticContext): void {
  for (const plan of queryAll(doc, 'TestPlan')) {
    const name = getStringProp(plan, 'TestPlan.name')
    if (name.length === 0) {
      // JMeter also stores the plan name in the testname attribute.
      // Only warn when both the stringProp and the attribute are empty.
      const testname = plan.getAttribute('testname')
      if (testname === null || testname.length === 0) {
        ctx.messages.push({
          severity: 'warning',
          ruleId: 'empty-plan-name',
          element: 'TestPlan',
          message: 'TestPlan has an empty name.',
          remediation: 'Set TestPlan.name to identify the test plan.',
        })
      }
    }
  }
}

function checkZeroThreads(doc: Document, ctx: SemanticContext): void {
  for (const tg of queryAll(doc, 'ThreadGroup')) {
    const numThreads = getIntProp(tg, 'ThreadGroup.num_threads')
    if (numThreads === 0) {
      ctx.messages.push({
        severity: 'error',
        ruleId: 'zero-threads',
        element: 'ThreadGroup',
        message: 'ThreadGroup has 0 threads; no load will be generated.',
        remediation: 'Increase ThreadGroup.num_threads to at least 1.',
      })
    }
  }
}

function checkHighThreadCount(doc: Document, ctx: SemanticContext): void {
  for (const tg of queryAll(doc, 'ThreadGroup')) {
    const numThreads = getIntProp(tg, 'ThreadGroup.num_threads')
    if (numThreads > 5000) {
      ctx.messages.push({
        severity: 'warning',
        ruleId: 'high-thread-count',
        element: 'ThreadGroup',
        message: `ThreadGroup.num_threads is ${numThreads}, which may overload the target.`,
        remediation: 'Consider reducing thread count or distributing across multiple ThreadGroups.',
      })
    }
  }
}

function checkUnknownMethod(doc: Document, ctx: SemanticContext): void {
  for (const sampler of queryAll(doc, 'HTTPSamplerProxy')) {
    const method = getStringProp(sampler, 'HTTPSampler.method')
    if (method.length > 0 && !VALID_METHODS.has(method.toUpperCase())) {
      ctx.messages.push({
        severity: 'warning',
        ruleId: 'unknown-method',
        element: 'HTTPSamplerProxy',
        message: `Unknown HTTP method "${method}" on HTTPSamplerProxy.`,
        remediation: `Use a standard method: ${Array.from(VALID_METHODS).join(', ')}`,
      })
    }
  }
}

function checkMissingDomainProtocol(doc: Document, ctx: SemanticContext): void {
  // Collect all HTTPRequestDefaults / ConfigTestElement elements that provide
  // inherited values. JMeter propagates domain and protocol from these elements
  // to child samplers that don't define their own.
  const inheritedDomain = new Set<string>()
  const inheritedProtocol = new Set<string>()
  for (const defaults of queryAll(doc, 'ConfigTestElement')) {
    const domain = getStringProp(defaults, 'HTTPSampler.domain')
    const protocol = getStringProp(defaults, 'HTTPSampler.protocol')
    if (domain.length > 0) {
      inheritedDomain.add('ConfigTestElement')
    }
    if (protocol.length > 0) {
      inheritedProtocol.add('ConfigTestElement')
    }
  }
  for (const defaults of queryAll(doc, 'HTTPRequestDefaults')) {
    const domain = getStringProp(defaults, 'HTTPSampler.domain')
    const protocol = getStringProp(defaults, 'HTTPSampler.protocol')
    if (domain.length > 0) {
      inheritedDomain.add('HTTPRequestDefaults')
    }
    if (protocol.length > 0) {
      inheritedProtocol.add('HTTPRequestDefaults')
    }
  }

  for (const sampler of queryAll(doc, 'HTTPSamplerProxy')) {
    const domain = getStringProp(sampler, 'HTTPSampler.domain')
    const protocol = getStringProp(sampler, 'HTTPSampler.protocol')
    if (domain.length === 0 && inheritedDomain.size === 0) {
      ctx.messages.push({
        severity: 'warning',
        ruleId: 'missing-domain',
        element: 'HTTPSamplerProxy',
        message: 'HTTPSamplerProxy has an empty domain.',
        remediation:
          'Set HTTPSampler.domain, or confirm HTTPRequestDefaults/ConfigTestElement provides an inherited domain.',
      })
    }
    if (protocol.length === 0 && inheritedProtocol.size === 0) {
      ctx.messages.push({
        severity: 'warning',
        ruleId: 'missing-protocol',
        element: 'HTTPSamplerProxy',
        message: 'HTTPSamplerProxy has an empty protocol.',
        remediation:
          'Set HTTPSampler.protocol, or confirm HTTPRequestDefaults/ConfigTestElement provides an inherited protocol.',
      })
    }
  }
}

function checkDeprecatedTag(doc: Document, ctx: SemanticContext): void {
  for (const el of queryAll(doc, '*')) {
    const testClass = el.getAttribute('testclass')
    if (testClass === null) {
      continue
    }

    // elementProp is a generic wrapper; its children carry the actual semantics.
    if (el.tagName === 'elementProp') {
      continue
    }

    const validTags = VALID_TAG_ALIASES[testClass]
    if (validTags === undefined || validTags.includes(el.tagName)) {
      continue
    }

    ctx.messages.push({
      severity: 'error',
      ruleId: 'deprecated-tag',
      element: el.tagName,
      message: `<${el.tagName}> is not a valid alias for testclass="${testClass}".`,
      remediation:
        validTags.length > 0
          ? `Use one of: ${validTags.join(', ')}`
          : 'Use the correct JMeter tag name for this testclass.',
    })
  }
}

function checkThreadGroupContent(
  doc: Document,
  ctx: SemanticContext,
  options: {
    tagSet: Set<string>
    ruleId: string
    severity: ValidationSeverity
    message: string
    remediation: string
  }
): void {
  for (const tg of queryAll(doc, 'ThreadGroup')) {
    const nextSibling = tg.nextElementSibling
    if (nextSibling === null || nextSibling.tagName !== 'hashTree') {
      continue
    }

    const hasContent = Array.from(nextSibling.querySelectorAll('*')).some((child) =>
      options.tagSet.has(child.tagName)
    )

    if (!hasContent) {
      ctx.messages.push({
        severity: options.severity,
        ruleId: options.ruleId,
        element: 'ThreadGroup',
        message: options.message,
        remediation: options.remediation,
      })
    }
  }
}

function checkNoAssertions(doc: Document, ctx: SemanticContext): void {
  checkThreadGroupContent(doc, ctx, {
    tagSet: ASSERTION_TAG_SET,
    ruleId: 'no-assertions',
    severity: 'info',
    message: 'ThreadGroup contains no assertions.',
    remediation: 'Add ResponseAssertion or DurationAssertion to validate responses.',
  })
}

function checkNoThinkTime(doc: Document, ctx: SemanticContext): void {
  checkThreadGroupContent(doc, ctx, {
    tagSet: TIMER_TAG_SET,
    ruleId: 'no-think-time',
    severity: 'info',
    message: 'ThreadGroup contains no timers.',
    remediation: 'Add ConstantTimer or UniformRandomTimer to simulate think time.',
  })
}

function checkHighLoopCount(doc: Document, ctx: SemanticContext): void {
  // LoopController is wrapped in elementProp in JMeter's XStream format,
  // so we must search by testclass rather than tag name.
  for (const el of queryAll(doc, 'elementProp')) {
    if (el.getAttribute('testclass') !== 'LoopController') {
      continue
    }

    const loops = getIntProp(el, 'LoopController.loops')
    if (loops > 1000) {
      ctx.messages.push({
        severity: 'warning',
        ruleId: 'high-loop-count',
        element: 'LoopController',
        message: `LoopController.loops is ${loops}, which may produce excessive iterations.`,
        remediation: 'Reduce loop count or split into multiple controllers.',
      })
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

export class JMXValidator {
  validate(jmx: string): ValidationReport {
    const syntaxErrors = validateJmxSyntaxToMessages(jmx)
    if (syntaxErrors.length > 0) {
      return {
        valid: false,
        errors: syntaxErrors,
        warnings: [],
        info: [],
      }
    }

    let doc: Document
    try {
      doc = new DOMParser().parseFromString(jmx, 'application/xml')
    } catch {
      return {
        valid: false,
        errors: syntaxErrorMessages('Failed to parse JMX document.'),
        warnings: [],
        info: [],
      }
    }

    const structureMessages = validateJmxStructure(doc)
    const semanticMessages = validateJmxSemantics(doc)

    const errors = [
      ...structureMessages.filter((m) => m.severity === 'error'),
      ...semanticMessages.filter((m) => m.severity === 'error'),
    ]
    const warnings = [
      ...structureMessages.filter((m) => m.severity === 'warning'),
      ...semanticMessages.filter((m) => m.severity === 'warning'),
    ]
    const info = semanticMessages.filter((m) => m.severity === 'info')

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    }
  }
}
