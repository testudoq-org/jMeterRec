# Complete HAR to JMeter JMX Converter

> **Status:** Reference / implementation workbook. Not required to implement
> `specs/008-extension-permissions-refresh.md`. The 008 spec is self-contained
> and inlines the types and contracts needed for the extension's in-memory
> HAR → JMX pipeline. This document is retained as detailed background material
> and AI-assisted implementation prompts only.

## Project Architecture

```
capultura-har-converter/
├── src/
│   ├── types/
│   │   ├── har.types.ts          # HAR format definitions
│   │   ├── jmeter.types.ts       # JMeter model definitions
│   │   └── traffic.types.ts      # Internal traffic model
│   ├── parsers/
│   │   └── har-parser.ts         # Parse HAR → internal model
│   ├── converters/
│   │   └── traffic-to-jmx.ts     # Convert traffic → JMX
│   ├── generators/
│   │   └── jmx-generator.ts      # Generate JMX XML
│   ├── utils/
│   │   ├── xml-builder.ts        # XML utility functions
│   │   ├── url-parser.ts         # URL parsing helpers
│   │   └── validators.ts         # Data validation
│   └── index.ts                  # Public API
├── tests/
│   ├── fixtures/
│   │   ├── sample.har            # Sample HAR file
│   │   └── expected.jmx          # Expected JMX output
│   └── converter.test.ts         # Unit tests
├── package.json
└── tsconfig.json
```

---

## 1. Type Definitions

### A. HAR Types

**File: `src/types/har.types.ts`**

```typescript
/**
 * HAR (HTTP Archive) format type definitions
 * Based on HAR 1.2 spec: http://www.softwareishard.com/blog/har-12-spec/
 */

export interface HAR {
  log: HARLog
}

export interface HARLog {
  version: string // "1.2"
  creator: HARCreator
  entries: HAREntry[]
  comment?: string
}

export interface HARCreator {
  name: string
  version: string
}

export interface HAREntry {
  pageref?: string
  startedDateTime: string // ISO 8601 format
  time: number // Total elapsed time in milliseconds
  request: HARRequest
  response: HARResponse
  cache: {}
  timings: HARTimings
  comment?: string
}

export interface HARRequest {
  method: string // GET, POST, etc
  url: string
  httpVersion: string // "HTTP/1.1"
  headers: HARHeader[]
  queryString: HARQueryParam[]
  postData?: HARPostData
  headersSize: number
  bodySize: number
  comment?: string
}

export interface HARResponse {
  status: number
  statusText: string
  httpVersion: string
  headers: HARHeader[]
  cookies: HARCookie[]
  content: HARContent
  redirectURL: string
  headersSize: number
  bodySize: number
  comment?: string
}

export interface HARHeader {
  name: string
  value: string
  comment?: string
}

export interface HARQueryParam {
  name: string
  value: string
  comment?: string
}

export interface HARPostData {
  mimeType: string
  params?: HARPostParam[]
  text?: string
  comment?: string
}

export interface HARPostParam {
  name: string
  value?: string
  fileName?: string
  contentType?: string
  comment?: string
}

export interface HARCookie {
  name: string
  value: string
  path?: string
  domain?: string
  expires?: string
  httpOnly?: boolean
  secure?: boolean
  comment?: string
}

export interface HARContent {
  size: number
  compression?: number
  mimeType: string
  text?: string
  encoding?: string
  comment?: string
}

export interface HARTimings {
  blocked?: number
  dns?: number
  connect?: number
  send: number
  wait: number
  receive: number
  ssl?: number
  comment?: string
}
```

**AI Prompt for Validation:**

```
Generate a TypeScript validator function that:
1. Takes a HAR object as input
2. Validates required fields (method, url, status)
3. Returns validation errors with field paths
4. Throws meaningful error messages for missing critical data
5. Handles optional fields gracefully

Requirements:
- Use io-ts or similar validation library
- Provide specific error messages
- Handle undefined vs null
- Check URL format validity
```

---

### B. Traffic Model Types (Internal)

**File: `src/types/traffic.types.ts`**

```typescript
/**
 * Internal traffic model - normalized representation
 * Used as intermediate format between HAR and JMX
 */

export interface TrafficModel {
  entries: TrafficEntry[]
  metadata: TrafficMetadata
}

export interface TrafficMetadata {
  recordedAt: string
  recordedBy: string
  duration: number // milliseconds
  totalRequests: number
  uniqueDomains: string[]
  comment?: string
}

export interface TrafficEntry {
  id: string // Unique identifier
  sequence: number // Order in recording

  // Request details
  request: {
    method: string // GET, POST, etc
    url: string
    domain: string // Extracted from URL
    path: string // /api/endpoint
    port: number // 80, 443, etc
    protocol: string // http, https
    headers: Record<string, string>
    queryString: Record<string, string>
    body?: string | object
    bodyType?: 'json' | 'form' | 'text' | 'xml'
  }

  // Response details
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body?: string
    size: number
  }

  // Timing
  timing: {
    startTime: string // ISO timestamp
    duration: number // milliseconds
    thinkTime: number // milliseconds before this request
  }

  // Metadata
  metadata: {
    isJsonRequest: boolean
    isFormRequest: boolean
    hasAuth: boolean
    authType?: 'basic' | 'bearer' | 'cookie'
    comment?: string
  }
}
```

**AI Prompt:**

```
Create utility functions to convert HAR entries to TrafficEntry format:

1. Function: harEntryToTraffic(harEntry: HAREntry): TrafficEntry
   - Extract domain/path from URL
   - Normalize headers (case-insensitive key lookup)
   - Parse query strings into key-value pairs
   - Detect request body type (JSON, form, text)
   - Calculate think time from previous entry
   - Generate unique ID

2. Function: enrichTrafficEntry(entry: TrafficEntry): TrafficEntry
   - Detect authentication type from headers
   - Flag JSON requests
   - Flag form requests
   - Extract Bearer tokens
   - Clean sensitive data (passwords, tokens) for logging

Requirements:
- Handle edge cases (missing headers, no body)
- Preserve order
- Maintain data integrity
- Type-safe operations
```

---

### C. JMeter Types

**File: `src/types/jmeter.types.ts`**

```typescript
/**
 * JMeter JMX format model
 * For generating valid Apache JMeter test plans
 */

export interface JMeterTestPlan {
  version: string // "1.2"
  properties: Record<string, string>
  elements: JMeterElement[]
}

export interface JMeterElement {
  guiclass: string
  testclass: string
  testname: string
  enabled: boolean
  elements?: JMeterElement[]
  [key: string]: any
}

// Samplers
export interface HTTPSamplerElement extends JMeterElement {
  guiclass: 'HttpTestSampleGui'
  testclass: 'HTTPSamplerProxy'
  domain: string
  port: string
  protocol: string
  path: string
  method: string
  postBodyRaw: boolean
  arguments?: ArgumentsElement
  responseFilters?: string
  imageParser: boolean
  concurrentPool: string
}

export interface ArgumentsElement extends JMeterElement {
  guiclass: 'HTTPArgumentsPanel'
  testclass: 'Arguments'
  arguments: Array<{
    name: string
    value: string
    metadata: string
    useEquals: boolean
  }>
}

// Controller
export interface ThreadGroupElement extends JMeterElement {
  guiclass: 'ThreadGroupGui'
  testclass: 'ThreadGroup'
  num_threads: string // "1"
  ramp_time: string // "1"
  duration: string // "0"
  schedulerEnable: boolean
  elementProp: {
    name: string
    elementType: string
    collectionProp: Array<{
      name: string
      value: string
    }>
  }
}

export interface ResultCollectorElement extends JMeterElement {
  guiclass: 'ViewResultsFullVisualizer'
  testclass: 'ResultCollector'
  filename?: string
  filenameprop?: string
}

// Timers
export interface ConstantTimerElement extends JMeterElement {
  guiclass: 'ConstantTimerGui'
  testclass: 'ConstantTimer'
  delay: string // milliseconds as string
}
```

---

## 2. HAR Parser

**File: `src/parsers/har-parser.ts`**

**AI Prompt:**

```
Create a HAR parser class with the following functionality:

class HARParser {
  /**
   * Parse HAR JSON and convert to internal TrafficModel
   *
   * @param harJson - Raw HAR JSON object or string
   * @returns TrafficModel with normalized entries
   * @throws Error if HAR is invalid
   */
  parse(harJson: string | object): TrafficModel {
    // Implementation needed
  }

  /**
   * Load HAR from file
   */
  async loadFromFile(filePath: string): Promise<TrafficModel> {
    // Implementation needed
  }

  /**
   * Validate HAR structure before parsing
   */
  private validate(har: any): void {
    // Implementation needed
  }

  /**
   * Extract domain and path from URL
   */
  private parseUrl(url: string): { domain: string; path: string; port: number; protocol: string } {
    // Implementation needed
  }

  /**
   * Detect request body type (JSON, form, etc)
   */
  private detectBodyType(mimeType: string, body?: string): 'json' | 'form' | 'text' | 'xml' {
    // Implementation needed
  }

  /**
   * Calculate think time between requests
   */
  private calculateThinkTime(currentEntry: HAREntry, previousEntry?: HAREntry): number {
    // Implementation needed
  }
}

Implement with:
- Proper error handling
- Field validation
- Type safety
- Support for optional fields
- URL parsing that handles:
  * http vs https
  * Non-standard ports
  * Query strings
  * Fragments
- Timestamp handling (ISO 8601 format)
```

---

## 3. JMeter Generator

**File: `src/generators/jmx-generator.ts`**

**AI Prompt:**

```
Create a JMeterXMLGenerator class that converts TrafficModel to JMX XML:

class JMeterXMLGenerator {
  /**
   * Generate complete JMeter test plan XML from traffic
   */
  generate(traffic: TrafficModel): string {
    // Returns valid JMeter JMX XML
  }

  /**
   * Create HTTP Sampler element for a traffic entry
   */
  private createHTTPSampler(entry: TrafficEntry): JMeterElement {
    // Implementation needed
  }

  /**
   * Create Header Manager if needed
   */
  private createHeaderManager(entry: TrafficEntry): JMeterElement | null {
    // Implementation needed
  }

  /**
   * Create arguments/query string element
   */
  private createArguments(entry: TrafficEntry): JMeterElement | null {
    // Implementation needed
  }

  /**
   * Create constant timer for think time
   */
  private createConstantTimer(thinkTimeMs: number): JMeterElement | null {
    // Implementation needed
  }

  /**
   * Create test plan root element
   */
  private createTestPlan(name: string): JMeterElement {
    // Implementation needed
  }

  /**
   * Create thread group (1 user, 1 iteration for now)
   */
  private createThreadGroup(): JMeterElement {
    // Implementation needed
  }

  /**
   * Convert to XML string with proper JMeter formatting
   */
  private toXMLString(element: JMeterElement): string {
    // Must produce valid JMeter JMX format
  }
}

Requirements:
- Generate valid JMeter 5.x compatible JMX
- Proper XML formatting
- All samplers in a thread group
- Preserve request/response details
- Handle edge cases:
  * Empty bodies
  * Missing headers
  * Non-standard ports
  * Query parameters
- Include result collectors
- Support for think time between requests
```

---

## 4. XML Builder Utility

**File: `src/utils/xml-builder.ts`**

**AI Prompt:**

```
Create XML builder utilities for JMeter JMX generation:

1. Function: buildXMLElement(element: JMeterElement): string
   - Convert JMeterElement object to XML
   - Handle all JMeter-specific attributes
   - Proper indentation and formatting
   - Escape special characters in text content
   - Support nested elements

2. Function: generateJMXDocument(rootElement: JMeterElement): string
   - Create complete JMX document
   - Add XML declaration
   - Add JMeter schema references if needed
   - Return formatted, valid XML

3. Helper: escapeXML(text: string): string
   - Escape &, <, >, ", '
   - Preserve valid XML characters

4. Helper: formatXML(xml: string, indent: number = 2): string
   - Pretty-print XML with indentation
   - Maintain readability

5. Function: validateXML(xmlString: string): { valid: boolean; errors: string[] }
   - Basic XML structure validation
   - Check for unclosed tags
   - Validate JMeter-specific required fields

Requirements:
- Must generate JMeter 5.x compatible format
- Use snake_case for JMeter properties
- Proper handling of CDATA sections if needed
- Support all JMeter element types
```

---

## 5. URL Parser Utility

**File: `src/utils/url-parser.ts`**

**AI Prompt:**

```
Create URL parsing utilities:

class URLParser {
  /**
   * Parse URL and extract components
   * @param url Full URL like "https://api.example.com:8080/path?query=value#fragment"
   * @returns Parsed components
   */
  static parse(url: string): {
    protocol: string;      // 'http' or 'https'
    domain: string;        // 'api.example.com'
    port: number;          // 80, 443, or custom
    path: string;          // '/path'
    queryString: Record<string, string>;  // {query: 'value'}
    fragment: string;      // 'fragment'
  } {
    // Implementation needed
  }

  /**
   * Reconstruct URL from components
   */
  static reconstruct(components: {
    protocol: string;
    domain: string;
    port?: number;
    path: string;
    queryString?: Record<string, string>;
  }): string {
    // Implementation needed
  }

  /**
   * Extract domain from URL (with subdomain)
   */
  static extractDomain(url: string): string {
    // 'https://api.example.com:8080/path' => 'api.example.com'
  }

  /**
   * Get default port for protocol
   */
  static getDefaultPort(protocol: string): number {
    // 'https' => 443, 'http' => 80
  }

  /**
   * Parse query string
   */
  static parseQueryString(query: string): Record<string, string> {
    // 'key1=value1&key2=value2' => {key1: 'value1', key2: 'value2'}
  }

  /**
   * Build query string from object
   */
  static buildQueryString(params: Record<string, string>): string {
    // {key1: 'value1'} => 'key1=value1'
  }
}

Requirements:
- Handle edge cases (missing protocol, port)
- Support IPv6 addresses
- Properly decode/encode special characters
- Handle complex query strings with arrays
- Maintain URL encoding rules
```

---

## 6. Main Converter Class

**File: `src/index.ts`**

**AI Prompt:**

```
Create the main HARConverter class that orchestrates conversion:

export class HARConverter {
  /**
   * Convert HAR JSON to JMeter JMX
   *
   * @param harInput - HAR object, JSON string, or file path
   * @param options - Conversion options
   * @returns JMeter JMX XML as string
   */
  async convert(
    harInput: string | object,
    options?: ConversionOptions
  ): Promise<string> {
    // Implementation needed
  }

  /**
   * Convert HAR file to JMX file
   */
  async convertFile(
    inputPath: string,
    outputPath: string,
    options?: ConversionOptions
  ): Promise<void> {
    // Implementation needed
  }
}

interface ConversionOptions {
  testPlanName?: string;        // Default: "Recorded from HAR"
  includeHeaders?: boolean;     // Default: true
  excludeHeaders?: string[];    // Headers to skip
  thinkTime?: number;          // Override think time (ms)
  removeQueries?: boolean;     // Strip query parameters
  sanitizeData?: boolean;      // Remove sensitive data
  recordingInfo?: boolean;     // Add metadata
}

Requirements:
- Clean, intuitive API
- Good error messages
- Progress reporting for large files
- Support for customization options
- Type-safe parameter handling
```

---

## 7. Complete Implementation Flow

**Step-by-Step Execution:**

```
User Input (HAR)
    ↓
[1] Load & Validate HAR
    - Parse JSON
    - Validate structure
    - Check required fields
    ↓
[2] Normalize to TrafficModel
    - Extract each entry
    - Parse URLs
    - Detect body types
    - Calculate think times
    - Generate IDs
    ↓
[3] Generate JMeter Elements
    - Create test plan
    - Create thread group
    - For each entry:
      * Create HTTP Sampler
      * Create Header Manager
      * Create Arguments element
      * Create think time timer
    ↓
[4] Build XML
    - Convert elements to XML
    - Format with proper indentation
    - Add JMeter metadata
    ↓
[5] Output JMX
    - Return formatted XML string
    - Write to file (optional)
    - Validate output
```

---

## 8. Testing Strategy

**File: `tests/converter.test.ts`**

**AI Prompt:**

```
Create comprehensive unit tests:

describe('HARConverter', () => {
  describe('HAR Parsing', () => {
    it('should parse valid HAR file', () => {
      // Test with sample.har fixture
    });

    it('should handle missing optional fields', () => {
      // Test with minimal HAR
    });

    it('should throw on invalid HAR', () => {
      // Test with malformed data
    });
  });

  describe('URL Parsing', () => {
    it('should extract domain correctly', () => {
      // Test various URL formats
    });

    it('should handle non-standard ports', () => {
      // Test custom ports
    });

    it('should parse query strings', () => {
      // Test complex queries
    });
  });

  describe('JMX Generation', () => {
    it('should generate valid JMeter XML', () => {
      // Compare with expected.jmx
    });

    it('should include HTTP samplers', () => {
      // Verify sampler generation
    });

    it('should add headers', () => {
      // Check header managers
    });

    it('should handle think times', () => {
      // Verify timer generation
    });
  });
});

Requirements:
- Use Jest or Vitest
- Test fixtures (sample HAR files)
- Expected output examples
- Edge case coverage
- Performance tests for large files
```

---

## 9. AI Prompts for Implementation

### Prompt 1: HAR Validation

```
Create a robust HAR validator function that:
1. Checks required fields exist (method, url, status)
2. Validates HTTP methods (GET, POST, PUT, DELETE, etc)
3. Verifies URLs are valid format
4. Checks status codes are numbers 1xx-5xx
5. Validates timestamps are ISO 8601
6. Reports specific errors with field paths

Handle edge cases:
- Null/undefined values
- Empty strings
- Missing optional fields
- Array vs object type mismatches

Return detailed error messages that help users fix HAR data.

Example error: "Entry[0].request.method: Expected one of [GET, POST, ...], got 'UNKNOWN'"
```

### Prompt 2: Request Body Detection

```
Create a function to detect request body types:

1. Analyze Content-Type header
2. Parse body content if available
3. Return type: 'json' | 'form' | 'xml' | 'text' | 'multipart' | 'binary'

Handle:
- application/json
- application/x-www-form-urlencoded
- multipart/form-data
- application/xml
- text/plain
- Custom content types

Also extract body as string/object appropriately:
- JSON: parse and validate
- Form: parse key=value pairs
- XML: keep as string
- Binary: indicate cannot be displayed

Requirements:
- Case-insensitive header lookup
- Charset handling (UTF-8, etc)
- Handle missing headers (infer from content)
```

### Prompt 3: JMeter XML Element Creation

```
Create functions to build JMeter XML elements:

1. createHTTPSampler(entry: TrafficEntry): JMeterElement
   - Must include: domain, port, protocol, path, method
   - Handle query strings as arguments
   - Handle POST body
   - Support HEAD, GET, POST, PUT, DELETE, etc
   - Default values for optional fields

2. createHeaderManager(headers: Record<string, string>): JMeterElement
   - Filter out auto-headers (Content-Length, Host, etc)
   - Keep custom headers
   - Return null if no custom headers

3. createConstantTimer(ms: number): JMeterElement
   - Convert to JMeter timer format
   - Return null if ms <= 0

4. createThreadGroup(): JMeterElement
   - Single user
   - Single iteration
   - No ramp-up
   - No duration limit

All elements must have correct JMeter class names and properties.
Reference current JMeter 5.x format.
```

### Prompt 4: XML Generation

```
Create robust XML generation that:

1. Takes JMeterElement objects and converts to valid JMeter JMX XML
2. Handles all element types (HTTPSampler, HeaderManager, Timer, etc)
3. Properly escapes special characters in text
4. Formats with proper indentation
5. Adds JMeter XML declaration and namespaces
6. Validates output is well-formed XML

Example output structure:
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Recorded from HAR">
      <!-- elements here -->
    </TestPlan>
    <hashTree/>
  </hashTree>
</jmeterTestPlan>

Key points:
- JMeter uses <hashTree/> for element containers
- Properties stored as attributes with snake_case names
- Nested elements in hashTree
- Proper quoting and escaping
```

---

## 10. Example: Complete Flow

```typescript
// Usage example
const converter = new HARConverter()

// Load HAR
const har = await converter.loadHAR('recording.har')

// Convert to JMX
const jmx = await converter.convert(har, {
  testPlanName: 'Login Flow Test',
  includeHeaders: true,
  excludeHeaders: ['Accept-Encoding', 'Cookie'],
  sanitizeData: true,
})

// Write to file
await fs.writeFile('test-plan.jmx', jmx)

// Now user can:
// 1. Open in JMeter
// 2. Run immediately for functional testing
// 3. Modify for load testing (add threads, ramp-up)
// 4. Add assertions and validations
```

---

## 11. Quality Checklist

**Before considering complete:**

- [ ] All HAR fields properly parsed
- [ ] URLs correctly parsed and reconstructed
- [ ] Headers preserved and passed through
- [ ] Query strings handled
- [ ] POST bodies included
- [ ] Request/response timing included
- [ ] Think time calculated and added
- [ ] Generated XML validates against JMeter schema
- [ ] File opens in JMeter without errors
- [ ] Test plays back correctly with 1 thread
- [ ] Unit tests covering 80%+ code
- [ ] Error messages helpful for users
- [ ] Documentation clear
- [ ] Performance acceptable (< 5s for 1000 requests)

---

## Summary

**This is the complete specification.** Hand these prompts to an AI tool (Claude, ChatGPT) and have it:

1. Start with type definitions
2. Build the parser
3. Create the generator
4. Build utilities
5. Write tests
6. Refine based on feedback

**Estimated effort: 3-5 days for a complete, tested, production-ready converter.**
