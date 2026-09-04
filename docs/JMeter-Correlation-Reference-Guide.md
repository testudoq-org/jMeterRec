# Identifying, Extracting, and Managing Dynamic Values

## 1. What is Correlation and Why it Matters

When JMeter records a test, it captures the exact values sent during recording — session tokens, CSRF tokens, view states, transaction IDs, and other values the server generates dynamically. On replay, the server generates new values for each session. If JMeter replays the old recorded values instead of the new ones, the server rejects the requests.

Correlation is the process of:

1. Identifying which values are dynamic (change per session or iteration)
2. Extracting them from server responses at runtime
3. Injecting the extracted values into subsequent requests

**Note on tooling:** the manual approach below (regex/JSON/XPath extractors) is the general-purpose method and works everywhere. But JMeter's recorder also has built-in correlation rules for common patterns (e.g. `HTTP(S) Test Script Recorder` correlation), and third-party tools such as BlazeMeter's recorder offer automatic correlation that catches most standard cases (CSRF tokens, view states, session IDs) without manual extractor setup. Reach for those first on well-known frameworks; fall back to manual extraction for anything custom or when auto-correlation misses a value.

### Signs that correlation is missing

| Symptom | Likely cause |
|---|---|
| 4xx errors (400, 401, 403) after first few requests | Session token / CSRF not correlated |
| Application error page in response body | View state or form token stale |
| Redirect loop | Session cookie not carried |
| "Tampered!" or "Invalid token" errors | Token extracted but corrupted (encoding issue) |
| NullPointerException on server | Token accepted but session data expired or missing |
| Same response for all users | Hardcoded user-specific token shared across threads |
| Works for 1 user, fails for 10+ | Token not isolated per thread (scoping issue) |

## 2. How to Identify What Needs Correlating

### Step 1 — Record twice and compare

The most reliable method. Record the same user journey twice and diff the two recordings:

- Any value that differs between recordings is dynamic and must be correlated
- Any value that stays the same is static and can be hardcoded

Common dynamic values to look for:

| Value type | Where it appears | Example |
|---|---|---|
| Session ID | Cookie, URL param, hidden field | `JSESSIONID=abc123` |
| CSRF token | Hidden form field, request header | `_csrf=8f3a...` |
| View state | Hidden form field | `__VIEWSTATE=...` |
| Correlation ID | JSON response, URL param | `"transactionId": "TXN-001"` |
| OAuth token | Response body, Authorization header | `"access_token": "eyJ..."` |
| Time-limited token | URL param, hidden field | `corr_id=Gnz%2F...` |
| Form action URL | HTML form action attribute | `action="/submit?token=xyz"` |
| Redirect URL | Location header, response body | `location: /next?id=456` |

### Step 2 — Use View Results Tree to inspect responses

Run a single-user test and in View Results Tree:

1. Click each sampler
2. Check **Request** tab — what values are being sent?
3. Check **Response** tab — what values appear in the response?
4. Check **Response Headers** tab — any `Set-Cookie` or `Location` headers?

Look for the same value appearing first in a response and then in a subsequent request — that is your correlation point.

### Step 3 — Search across responses

In View Results Tree, use the Search field at the bottom to search for a specific value across all responses. This quickly shows you which sampler returned the value you need to extract.

### Step 4 — Check hidden form fields

HTML forms often contain hidden fields with dynamic values:

```html
<input type="hidden" name="__RequestVerificationToken" value="CfDJ8...abc" />
<input type="hidden" name="__VIEWSTATE" value="/wEPDwUK..." />
<input type="hidden" name="sessionToken" value="a1b2c3" />
```

These must always be correlated — they are generated server-side and change every session.

## 3. Regex Extractor — Deep Dive

The most versatile extractor. Works on any text-based response.

### Configuration fields explained

| Field | Description |
|---|---|
| Apply to | Which part of the response to search (see below) |
| Field to check | Body / Headers / URL / Request Body |
| Reference name | Variable name to store the result in |
| Regex | Java regex pattern with at least one capture group `()` |
| Template | Which capture group(s) to use — `$1$` for first group |
| Match No | Which match to use: 1 = first, -1 = random, 0 = all |
| Default value | Value to use if no match found — always set this |

### Apply to options

| Option | When to use |
|---|---|
| Main sample only | Default — searches the main response only |
| Sub-samples only | Searches embedded resources only |
| Main sample and sub-samples | Searches everything |
| JMeter Variable | Applies the regex to a JMeter variable value |

### Regex syntax essentials

```
.           Any single character
.*          Any characters (greedy -- as much as possible)
.*?         Any characters (lazy -- as little as possible)
[^"]+       Any characters except a double quote (use for attribute values)
[^<]+       Any characters except < (use for tag content)
\d+         One or more digits
\w+         One or more word characters (letters, digits, underscore)
(...)       Capture group -- what gets stored in $1$, $2$ etc.
(?:...)     Non-capturing group -- groups without storing
```

### Common regex patterns

```
# Hidden form field value
name="myField"\s+value="([^"]+)"

# Session cookie value
JSESSIONID=([^;]+)

# JSON value (simple)
"token"\s*:\s*"([^"]+)"

# URL parameter
[?&]corr_id=([^&"'\s]+)

# HTML href link
href="([^"]+)"

# Meta redirect
content="\d+;\s*url=([^"]+)"

# Bearer token in header
Authorization:\s*Bearer\s+([^\r\n]+)

# Value between two known strings (use Boundary Extractor instead)
startString(.+?)endString
```

### Multi-group template example

If your regex has multiple capture groups:

```
Regex:    name="([^"]+)"\s+value="([^"]+)"
Template: $1$=$2$
Result:   fieldName=fieldValue
```

### Match No explained

| Value | Behaviour |
|---|---|
| 1 | First match — most common |
| 2 | Second match |
| -1 | Random match from all found |
| 0 | All matches stored as `varName_1`, `varName_2`, etc. + `varName_matchNr` with count |

## 4. JSON Extractor — Deep Dive

Use for REST APIs returning JSON responses.

### Configuration fields

| Field | Description |
|---|---|
| Names of created variables | Variable name(s) to store results |
| JSONPath expressions | JSONPath query to extract value |
| Match No | Same as Regex Extractor |
| Default values | Fallback if path not found |
| Compute concatenation var | Creates `varName_ALL` with all matches joined |

### JSONPath syntax essentials

```
$               Root element
.key            Child element by key
['key']         Child element (bracket notation -- use for special chars)
[0]             Array element by index (zero-based)
[*]             All array elements
..key           Recursive descent -- find key at any depth
[?(@.key==v)]   Filter -- elements where key equals value
@               Current element (used in filters)
```

### Common JSONPath patterns

```
# Simple string value
$.token

# Nested object
$.data.user.id

# Array first element
$.items[0].id

# Array all IDs (use Match No = 0)
$.items[*].id

# Filter by condition
$.items[?(@.status=='active')].id

# Recursive search for a key anywhere in the document
$..token

# Array last element
$.items[-1:].id
```

**JSONPath index vs. Match No — these are two separate mechanisms, don't mix them up.** `$.items[-1:].id` is a JSONPath *array slice* — it selects the last element of the array before extraction even runs. Match No, by contrast, chooses which *occurrence of the whole JSONPath match* to keep when the expression matches multiple times (e.g. via `[*]` or `..`). Setting Match No to -1 does not mean "last array element" — it means "pick a random match from the full match set." Don't use them interchangeably.

Also note: JMeter's JSON Extractor is built on Jayway JsonPath, which has had inconsistent support for negative array slices across versions. Test slice syntax like `[-1:]` against your actual JMeter version before relying on it — if it doesn't behave as expected, extract the array with `$.items[*].id` and Match No = 0, then reference the last stored variable using `${varName_matchNr}`.

### Handling JSON arrays

If the response is an array and you need all values:

```
JSONPath:  $[*].id
Match No:  0
```

This stores:
- `varName_1` = first id
- `varName_2` = second id
- `varName_matchNr` = total count

Then iterate with a ForEach Controller using `varName_` as the prefix.

## 5. XPath Extractor — Deep Dive

Use for XML responses or HTML when structure is important.

### Two versions

| Version | Use when |
|---|---|
| XPath Extractor | Legacy XML; simpler but less forgiving of malformed HTML |
| XPath2 Extractor | Modern XPath 2.0; handles namespaces and complex queries better |

### Configuration

| Field | Description |
|---|---|
| Use Tidy | Tick for HTML responses — converts HTML to well-formed XML before parsing |
| Quiet | Suppress Tidy warnings in log |
| Report errors | Log Tidy parse errors |
| Show warnings | Log Tidy warnings |
| XPath query | XPath expression to extract value |
| Match No | Same as other extractors |

### Common XPath patterns

```
# Element text content
//input[@name='__RequestVerificationToken']/@value

# Hidden field value
//input[@type='hidden'][@name='sessionToken']/@value

# Link href
//a[@id='myLink']/@href

# Form action URL
//form[@id='myForm']/@action

# Table cell text
//table[@id='results']//tr[2]/td[1]/text()

# Element with specific class
//div[@class='error-message']/text()

# Any element containing specific text
//*[contains(text(),'Success')]
```

## 6. CSS Selector Extractor — Deep Dive

More intuitive than XPath for HTML. Uses familiar CSS syntax.

### Configuration

| Field | Description |
|---|---|
| CSS Selector expression | CSS selector to find the element |
| Attribute | Which attribute to extract; leave empty for text content |
| Match No | Same as other extractors |

### Common CSS selector patterns

```
/* Hidden input value */
input[name='__RequestVerificationToken']
Attribute: value

/* Link href */
a#myLink
Attribute: href

/* Form action */
form#myForm
Attribute: action

/* First table row second cell text */
table#results tr:nth-child(2) td:nth-child(2)
Attribute: (empty -- gets text content)

/* Meta refresh URL */
meta[http-equiv='refresh']
Attribute: content

/* Select option value */
select#mySelect option[selected]
Attribute: value
```

## 7. Boundary Extractor — Deep Dive

The simplest extractor — no regex knowledge needed. Finds a value between two known strings.

### When to use

- Extracting values between predictable surrounding text
- When the value itself contains special regex characters
- Faster than regex for simple cases

### Configuration

| Field | Description |
|---|---|
| Left boundary | Text immediately before the value |
| Right boundary | Text immediately after the value |
| Match No | Same as other extractors |

### Example

Response:

```html
<input type="hidden" name="token" value="abc123xyz" />
```

Configuration:

```
Left boundary:  name="token" value="
Right boundary: "
Result:         abc123xyz
```

Much simpler than the equivalent regex:

```
name="token" value="([^"]+)"
```

## 8. Extracting from Headers and Cookies

### Extract from response headers

Use Regex Extractor with Field to check = Response Headers:

```
# Extract Set-Cookie value
Regex:  Set-Cookie:\s*JSESSIONID=([^;]+)

# Extract Location redirect URL
Regex:  Location:\s*([^\r\n]+)

# Extract Content-Type
Regex:  Content-Type:\s*([^\r\n]+)
```

### Extract specific cookie value

If you just need a cookie value and the Cookie Manager is active, the cookie is carried automatically. But if you need to read it as a variable:

```
Field to check:  Response Headers
Regex:           Set-Cookie:\s*myCookie=([^;]+)
Reference name:  myCookie_value
```

### Extract from request headers

Use Field to check = Request Headers if you need to capture what JMeter sent (useful for debugging):

```
Field to check:  Request Headers
Regex:           Authorization:\s*Bearer\s+([^\r\n]+)
```

## 9. JSR223 PostProcessor for Complex Extraction

When built-in extractors aren't enough — use Groovy for full programmatic control.

### Access response data

```groovy
// Full response body as string
def body = prev.getResponseDataAsString()
// Response code
def code = prev.getResponseCode()
// Response headers
def headers = prev.getResponseHeaders()
// Response size in bytes
def size = prev.getResponseData().length
```

### Extract with Groovy regex

```groovy
def body = prev.getResponseDataAsString()
// Simple regex extraction
def matcher = body =~ /corr_id=([^"&\s]+)/
if (matcher.find()) {
    vars.put("corr_id", matcher.group(1))
    log.info("Extracted corr_id: " + matcher.group(1))
} else {
    vars.put("corr_id", "NOT_FOUND")
    log.warn("corr_id not found in response")
}
```

### Parse JSON with Groovy

```groovy
import groovy.json.JsonSlurper
def body = prev.getResponseDataAsString()
def json = new JsonSlurper().parseText(body)

// Simple field
vars.put("accessToken", json.access_token)
// Nested field
vars.put("userId", json.data.user.id.toString())
// Array first element
vars.put("firstItemId", json.items[0].id.toString())
// Array all IDs
json.items.eachWithIndex { item, i ->
    vars.put("itemId_${i+1}", item.id.toString())
}
vars.put("itemId_matchNr", json.items.size().toString())
```

### Parse HTML with Groovy

```groovy
def body = prev.getResponseDataAsString()
// Extract hidden field value
def matcher = body =~ /name="__RequestVerificationToken"\s+value="([^"]+)"/
if (matcher.find()) {
    vars.put("csrfToken", matcher.group(1))
}
// Extract multiple values
def pattern = ~/name="item_(\d+)"\s+value="([^"]+)"/
def results = []
body.eachMatch(pattern) { match ->
    results << [id: match[1], value: match[2]]
}
log.info("Found ${results.size()} items")
```

### Conditional extraction

```groovy
def body = prev.getResponseDataAsString()
// Check if page has an error first
if (body.contains("Error") || body.contains("Exception")) {
    vars.put("extraction_status", "ERROR")
    prev.setSuccessful(false)
    prev.setResponseMessage("Error page detected")
    return
}
// Only extract if page is valid
def matcher = body =~ /sessionId=([^"&]+)/
if (matcher.find()) {
    vars.put("sessionId", matcher.group(1))
    vars.put("extraction_status", "OK")
}
```

## 10. Variable Scoping — vars vs props

One of the most misunderstood areas in JMeter correlation.

### vars — thread-local variables

```groovy
vars.put("myVar", "value")    // set
vars.get("myVar")              // get
vars.remove("myVar")           // delete
```

- Only visible to the current thread (virtual user)
- Perfect for per-user session tokens, extracted values
- Lost when the thread ends
- Accessible via `${myVar}` in samplers

### props — global properties

```groovy
props.put("myProp", "value")  // set
props.get("myProp")            // get
props.get("myProp", "default") // get with default
```

- Visible to all threads across all Thread Groups
- Use for shared data: setUp Thread Group output, test-wide config
- Set once, read by all
- Accessible via `${__P(myProp,default)}` in samplers

### When to use which

| Scenario | Use |
|---|---|
| Session token per user | vars |
| CSRF token per request | vars |
| Common test data (env URL, test type) | props |
| setUp Thread Group → main Thread Group | props |
| tearDown needs data from main Thread Group | props |
| Shared counter across all users | props with synchronisation |
| Per-user iteration counter | vars |

### Passing from setUp to main Thread Group

```groovy
// In setUp Thread Group JSR223 Sampler
props.put("auth_token", vars.get("extracted_token"))
props.put("base_url", "https://myapp.example.com")

// In main Thread Group JSR223 PreProcessor
def token = props.get("auth_token")
vars.put("auth_token", token)  // make it available as ${auth_token}
```

## 11. Correlation Patterns by Application Type

### REST API correlation

```
Flow:
POST /auth/login
  Body: {"username":"user1","password":"pass"}
  Response: {"access_token":"eyJ...", "refresh_token":"abc..."}
  -> JSON Extractor: access_token -> ${access_token}

GET /api/resource
  Header: Authorization: Bearer ${access_token}
```

JSON Extractor config:

```
Variable:   access_token
JSONPath:   $.access_token
Default:    TOKEN_NOT_FOUND
```

Header Manager config:

```
Name:   Authorization
Value:  Bearer ${access_token}
```

### HTML form correlation (CSRF)

```
Flow:
GET /form/page
  Response contains: <input type="hidden" name="_csrf" value="abc123" />
  -> Regex Extractor: _csrf -> ${csrf_token}

POST /form/submit
  Body: field1=value1&_csrf=${csrf_token}
```

Regex Extractor config:

```
Regex:    name="_csrf"\s+(?:type="hidden"\s+)?value="([^"]+)"
Template: $1$
Default:  CSRF_NOT_FOUND
```

### ViewState correlation (ASP.NET)

```
Flow:
GET /page.aspx
  Response contains: <input name="__VIEWSTATE" value="/wEPDwUK..." />
  -> Regex Extractor: __VIEWSTATE -> ${viewstate}
  -> Regex Extractor: __VIEWSTATEGENERATOR -> ${viewstate_gen}
  -> Regex Extractor: __EVENTVALIDATION -> ${event_validation}

POST /page.aspx
  Body: __VIEWSTATE=${viewstate}
        &__VIEWSTATEGENERATOR=${viewstate_gen}
        &__EVENTVALIDATION=${event_validation}
        &myField=myValue
```

Note: ViewState values contain `+` and `=` characters. Always tick **URL Encode** in the Parameters tab.

### Session-based web app correlation

```
Flow:
POST /login
  Response header: Set-Cookie: JSESSIONID=abc123; Path=/
  -> Cookie Manager handles this automatically

GET /dashboard
  Cookie: JSESSIONID=abc123   <- sent automatically by Cookie Manager

GET /api/data?sessionToken=${session_token}
  -> May need explicit extraction if token appears in response body
```

### OAuth 2.0 / JWT correlation

```
Flow:
POST /oauth/token
  Body: grant_type=client_credentials
        &client_id=${client_id}
        &client_secret=${client_secret}
  Response: {"access_token":"eyJ...","expires_in":3600}
  -> JSON Extractor: access_token -> ${bearer_token}

GET /api/protected
  Header: Authorization: Bearer ${bearer_token}
```

Token expiry check (flags when a refresh is due — does not perform the refresh itself):

```groovy
// In JSR223 PreProcessor before each authenticated request
// Check if token is about to expire; if so, flag it for the next
// step to handle (this snippet only sets a flag, it does not call
// the token endpoint)
def tokenExpiry = vars.get("token_expiry")
def now = System.currentTimeMillis()
if (tokenExpiry == null || Long.parseLong(tokenExpiry) - now < 60000) {
    vars.put("needs_token_refresh", "true")
} else {
    vars.put("needs_token_refresh", "false")
}
```

To actually refresh, wrap the `POST /oauth/token` call above in an **If Controller** gated on `${needs_token_refresh}`, and re-run the JSON Extractor against its response to overwrite `${bearer_token}` and `${token_expiry}`.

## 12. Handling Multiple Matches

When a response contains multiple occurrences of a pattern.

### Extract all matches

```
Match No:  0
```

This stores:
- `varName_matchNr` = total count (e.g. 5)
- `varName_1` through `varName_5` = individual values

### Iterate over all matches with ForEach Controller

```
ForEach Controller:
  Input variable prefix:  varName
  Output variable:        currentItem
  Start index:            1
  End index:              (leave empty -- reads matchNr automatically)
  Add underscore:         tick
  -> HTTP Request using ${currentItem}
```

### Extract a specific occurrence

```
Match No:  2    <- gets the second match only
```

### Extract a random match

```
Match No:  -1   <- picks one at random each iteration
```

### Extract by condition using Groovy

```groovy
def body = prev.getResponseDataAsString()
def pattern = ~/id="item_(\d+)"\s+status="active"/
def ids = []
body.eachMatch(pattern) { match ->
    ids << match[1]
}
// Pick a random active item
if (!ids.isEmpty()) {
    def random = new Random()
    def chosen = ids[random.nextInt(ids.size())]
    vars.put("chosen_item_id", chosen)
    log.info("Chosen active item: " + chosen)
} else {
    vars.put("chosen_item_id", "NOT_FOUND")
    log.warn("No active items found")
}
```

## 13. Chaining Extractions

When you need values from multiple steps combined or transformed before use.

### Chain 1 — Extract then transform

```groovy
// Step 1: Regex Extractor extracts raw value
// Reference: raw_token = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiam9obiJ9.abc"
// Step 2: JSR223 PostProcessor decodes and extracts sub-value
import groovy.json.JsonSlurper
import java.util.Base64
def rawToken = vars.get("raw_token")
if (rawToken && rawToken != "NOT_FOUND") {
    // Decode JWT payload (middle part)
    def parts = rawToken.split("\\.")
    def payload = new String(Base64.decoder.decode(parts[1]))
    def json = new JsonSlurper().parseText(payload)
    vars.put("token_user", json.user)
    vars.put("token_expiry", (json.exp * 1000L).toString())
    log.info("Token user: " + json.user)
}
```

### Chain 2 — Extract from response, use in next request, extract from that

```
GET /session/start
  -> Extract: sessionId from response body

POST /session/${sessionId}/data
  -> Extract: dataToken from response body

GET /download/${dataToken}
  -> Final response: the file/PDF/data
```

### Chain 3 — Combine two extracted values

```groovy
def userId   = vars.get("user_id")
def tenantId = vars.get("tenant_id")
// Combine into a composite key
vars.put("composite_key", "${tenantId}:${userId}")
// URL-encode it for use in a request
def encoded = java.net.URLEncoder.encode("${tenantId}:${userId}", "UTF-8")
vars.put("composite_key_encoded", encoded)
```

## 14. Debugging Correlation Issues

### Tool 1 — Debug Sampler

Add a Debug Sampler after your extractor. In View Results Tree, its response shows all current variable values:

```
corr_id=GnUCOSZjuz11AGNNTVk6j3UAYtK%2FTskaEXyKVQ%3D%3D
csrf_token=8f3a2b1c...
session_id=abc123
```

If a variable shows `NOT_FOUND` or is missing, the extractor failed.

### Tool 2 — View Results Tree response search

Use the Search field at the bottom of View Results Tree. Search for the value you expect to extract. This shows you exactly which sampler's response contains it.

### Tool 3 — JMeter log

Add `log.info()` statements in JSR223 scripts:

```groovy
log.info("=== CORRELATION DEBUG ===")
log.info("corr_id value: " + vars.get("corr_id"))
log.info("corr_id matchNr: " + vars.get("corr_id_matchNr"))
log.info("=========================")
```

View in real time via View → Log Viewer in JMeter GUI.

### Tool 4 — Response Assertion to catch extraction failure

Add a Response Assertion after extraction:

```
Field to test:  JMeter Variable: corr_id
Pattern:        NOT_FOUND
Not:            tick (assert it does NOT equal NOT_FOUND)
```

This causes the sampler to fail immediately if extraction failed, rather than silently continuing with a bad value.

### Tool 5 — Check the regex independently

Test your regex at regex101 (build, test, and debug regex) before putting it in JMeter:

1. Paste the response body as the test string
2. Use Java flavour
3. Check the capture groups match what you expect

### Common debugging scenarios

**Extractor returns empty / default value:**
- Check "Apply to" scope — is the value in the main response or a sub-resource?
- Check "Field to check" — is the value in body, headers, or URL?
- Test the regex independently on the actual response
- Check for encoding differences (HTML entities like `&amp;` vs `&`)

**Value extracted correctly but request still fails:**
- Check if the value needs URL encoding (contains `+`, `=`, `/`, `&`)
- Check if the value is being double-encoded
- Check the correct parameter name is used in the request
- Verify the value isn't expiring between extraction and use

**Works for first iteration, fails on second:**
- Extraction is from a static response that doesn't change per iteration
- The server generates a new token per iteration but you're reusing the old one
- Check the extractor is on the correct sampler (must run each iteration)

## 15. URL Encoding and Token Handling

### The golden rule

Extract the value in whatever form the server sends it, then pass it in whatever form the server expects it.

| Server sends | Server expects | Action in JMeter |
|---|---|---|
| `%2F%3D` (encoded) | `%2F%3D` (encoded) | Use as-is, do NOT URL-encode again |
| `/=` (decoded) | `%2F%3D` (encoded) | URL-encode before sending |
| `/=` (decoded) | `/=` (decoded) | Use as-is |

### How to URL-encode in JMeter

Option 1 — In sampler parameter (recommended):

```
Parameters tab:
  Name: token    Value: ${myToken}    URL Encode: TICK
```

Option 2 — JMeter function:

```
${__urlencode(${myToken})}
```

Option 3 — Groovy at extraction time:

```groovy
def raw = vars.get("myToken")
def encoded = java.net.URLEncoder.encode(raw, "UTF-8")
vars.put("myToken_encoded", encoded)
```

### Base64 tokens

If the token is Base64 encoded and you need to decode it:

```groovy
import java.util.Base64
def encoded = vars.get("base64Token")
def decoded = new String(Base64.decoder.decode(encoded))
vars.put("decoded_token", decoded)
```

### JWT tokens

JWTs have three parts separated by `.` — header, payload, signature. The payload is Base64url encoded:

```groovy
import java.util.Base64
import groovy.json.JsonSlurper
def jwt = vars.get("jwt_token")
def parts = jwt.split("\\.")
// Decode payload (add padding if needed)
def payloadB64 = parts[1]
while (payloadB64.length() % 4 != 0) payloadB64 += "="
payloadB64 = payloadB64.replace("-", "+").replace("_", "/")
def payload = new String(Base64.decoder.decode(payloadB64))
def json = new JsonSlurper().parseText(payload)
vars.put("jwt_user_id", json.sub.toString())
vars.put("jwt_expiry_ms", (json.exp * 1000L).toString())
```

## 16. Common Correlation Mistakes

**Mistake 1 — Extracting from the wrong sampler.** The extractor is placed on the wrong request. Always place the extractor on the sampler whose response contains the value, not the sampler that uses the value.

**Mistake 2 — Wrong "Apply to" scope.** Embedded resources (images, CSS, JS) are sub-samples. If the value appears in a sub-sample response, set "Apply to" to "Sub-samples only" or "Main sample and sub-samples".

**Mistake 3 — HTML entities not accounted for.** HTML responses encode `&` as `&amp;`, `"` as `&quot;`, etc. A regex written only against the raw character misses the encoded form:

```
# Matches only a literal & separator -- misses &amp; entirely
corr_id=([^&]+)

# Better -- matches up to either & or the start of &amp;,
# and up to a following quote or whitespace
corr_id=([^&"'\s]+?)(?:&amp;|&|["'\s]|$)

# Simplest fix in practice: decode entities first, then run
# a plain regex against the decoded string
def decoded = body.replace("&amp;", "&")
```

The character class alone (`[^&"'\s]+`) does not solve entity encoding — it just excludes `&`, `"`, `'` and whitespace from the captured value. It only works if the value itself never contains those characters and the surrounding delimiter is a literal `&`, not `&amp;`. When the delimiter itself is encoded, decode entities first, or match `&amp;` explicitly as an alternative delimiter.

**Mistake 4 — Double URL encoding.** Extracting an already-encoded value (`%2F`) and then URL-encoding it again produces `%252F` — double encoded. The server decodes once and gets `%2F` instead of `/`, causing failures.

**Mistake 5 — Using vars across Thread Groups.** `vars` is thread-local. A value set in setUp Thread Group's `vars` is not visible in the main Thread Group. Use `props` to pass values between Thread Groups.

**Mistake 6 — Greedy regex consuming too much.**

```
# Greedy -- may consume everything to the last quote on the page
value="(.*)"

# Lazy -- stops at the first closing quote
value="(.*?)"

# Character class -- most precise
value="([^"]+)"
```

**Mistake 7 — Not setting a default value.** If extraction fails silently, subsequent requests use an empty or null variable — causing hard-to-debug failures. Always set a meaningful default like `NOT_FOUND` so Debug Sampler shows the failure clearly.

**Mistake 8 — Hardcoding extracted values.** The whole point of correlation is dynamic extraction. Never hardcode a recorded token value — it will be invalid on the next run.

**Mistake 9 — Extractor scope too broad.** An extractor placed at Thread Group level applies to ALL samplers. Place extractors as children of the specific sampler they should read from.

**Mistake 10 — Not accounting for timing.** Time-limited tokens (JWT, session tokens, CSRF) have expiry windows. If your script has large think times or the test runs slowly, tokens may expire mid-test. Add token refresh logic (see Section 11) or reduce think times.

## 17. Correlation Checklist

Use this checklist for every new script before running a load test.

**Identification**
- [ ] Recorded the journey twice and compared the two recordings
- [ ] Identified all values that differ between recordings
- [ ] Located which response each dynamic value comes from
- [ ] Confirmed which subsequent requests use each dynamic value

**Extraction setup**
- [ ] Extractor placed as child of the correct sampler (the one that returns the value)
- [ ] "Apply to" scope is correct (main sample vs sub-samples)
- [ ] "Field to check" matches where the value appears (body, headers, URL)
- [ ] Regex / JSONPath / XPath / CSS tested independently and confirmed correct
- [ ] Default value set to something clearly identifiable (e.g. `NOT_FOUND`)
- [ ] Match No set correctly (1 for first, 0 for all, -1 for random)

**Variable usage**
- [ ] Variable referenced correctly in subsequent requests (`${varName}`)
- [ ] URL encoding applied if value contains `+`, `=`, `/`, `&` characters
- [ ] No double-encoding (value already encoded from extraction)
- [ ] Correct scope used (`vars` for per-thread, `props` for cross-thread)

**Verification**
- [ ] Debug Sampler added and confirmed variable holds correct value
- [ ] Single-user test run end-to-end with no correlation errors
- [ ] 2-3 user test run confirms each user gets independent values
- [ ] No hardcoded recorded values remaining in samplers
- [ ] Response Assertion added to catch extraction failures

**Edge cases**
- [ ] Token expiry handled (refresh logic if needed)
- [ ] Empty response / error page handled (guard with If Controller)
- [ ] Multiple matches handled correctly (ForEach if iterating)
- [ ] HTML entities accounted for in regex pattern
