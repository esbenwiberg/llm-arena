# Blueprint: Hello API

## System Prompt
You are a skilled Node.js developer. Write clean, working code.

## Task
Build a simple REST API using Node.js (no framework, just `node:http`) with these endpoints:

1. `GET /` — returns `{ "message": "Hello, Arena!" }` with status 200
2. `GET /health` — returns `{ "status": "ok" }` with status 200
3. `POST /echo` — accepts a JSON body and returns it back as `{ "echo": <body> }` with status 200
4. `GET /add?a=1&b=2` — returns `{ "result": 3 }` with the sum of query params `a` and `b`
5. Any other route — returns `{ "error": "Not found" }` with status 404

The server should listen on port 3456. All responses should have `Content-Type: application/json`.

Create the following files:
- `server.js` — the HTTP server
- `server.test.js` — tests using Node.js built-in test runner (`node --test`)

## Test Command
```bash
node --test server.test.js
```

## Success Criteria
- All tests pass
- Server handles all 5 endpoint cases correctly
- Uses only Node.js built-ins (no npm packages)
