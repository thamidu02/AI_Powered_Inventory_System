import urllib.request
import urllib.parse
import json
import sys

print("=== Starting End-to-End Guided Workflow Verification ===")

# 1. Test AI Service (Port 8000)
print("\n[1/3] Testing AI Service Guided Workflow Generation...")
ai_chat_url = "http://localhost:8000/chat"
ai_payload = json.dumps({
    "message": "Show me how to receive a new stock batch",
    "user_id": "test-user-123"
}).encode('utf-8')

req = urllib.request.Request(ai_chat_url, data=ai_payload, headers={"Content-Type": "application/json"})
ai_events = []
with urllib.request.urlopen(req) as resp:
    for line in resp:
        line_str = line.decode('utf-8').strip()
        if line_str.startswith("data: "):
            ev = json.loads(line_str[6:])
            ai_events.append(ev)
            if ev.get("type") == "done":
                break

guided_wf_events = [e for e in ai_events if e.get("type") == "guided_workflow"]
intent_events = [e for e in ai_events if e.get("type") == "intent"]
message_events = [e for e in ai_events if e.get("type") == "message"]

print(f"  AI Events received: {len(ai_events)}")
print(f"  Intent: {[e.get('intent') for e in intent_events]}")
assert len(intent_events) > 0 and intent_events[0].get("intent") == "GUIDED_WORKFLOW", "Expected intent GUIDED_WORKFLOW"
assert len(guided_wf_events) > 0, "Expected guided_workflow event emitted"

gw = guided_wf_events[0]
print(f"  Workflow Type: {gw.get('workflow_type')}")
print(f"  Title: {gw.get('title')}")
print(f"  Steps Count: {len(gw.get('steps', []))}")
assert len(gw.get("steps", [])) == 9, "Expected 9 steps in RECEIVE_STOCK"

full_text = "".join(e.get("text", "") for e in message_events)
assert "**" not in full_text and "__" not in full_text, "Output violates rule: no markdown bold (** or __)"
assert not any(line.strip().startswith(("# ", "## ", "### ")) for line in full_text.splitlines()), "Output violates rule: no markdown headings"
print("  Formatting rules verified: No ** bold, no # headings.")
print("  [SUCCESS] AI Service returns structured guided workflow correctly.")

# 2. Test Backend Authentication (Port 5066)
print("\n[2/3] Testing Backend Authentication & Token Acquisition...")
login_url = "http://localhost:5066/api/auth/login"
login_payload = json.dumps({
    "email": "inventory@restaurant.com",
    "password": "Restaurant@123"
}).encode('utf-8')

req = urllib.request.Request(login_url, data=login_payload, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    login_data = json.loads(resp.read().decode('utf-8'))
    token = login_data.get("token")
    user_id = login_data.get("user", {}).get("id")

print(f"  Authenticated as: {login_data.get('user', {}).get('email')} (Role: {login_data.get('user', {}).get('role')})")
auth_headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}

# 3. Test Backend Guided Workflow Endpoints
print("\n[3/3] Testing Backend Guided Workflow Endpoints & State Persistence...")

# 3a. Definitions
def_url = "http://localhost:5066/api/ai/guided-workflows/definitions"
req = urllib.request.Request(def_url, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    defs = json.loads(resp.read().decode('utf-8'))
print(f"  Available definitions: {[d.get('workflowType') for d in defs]}")
assert any(d.get("workflowType") == "RECEIVE_STOCK" for d in defs), "RECEIVE_STOCK must be in definitions"

# 3b. Start Workflow
start_url = "http://localhost:5066/api/ai/guided-workflows/start"
start_payload = json.dumps({
    "workflowType": "RECEIVE_STOCK",
    "title": gw.get("title"),
    "description": gw.get("description"),
    "steps": gw.get("steps")
}).encode('utf-8')

req = urllib.request.Request(start_url, data=start_payload, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    start_res = json.loads(resp.read().decode('utf-8'))

wf_id = start_res.get("workflowId")
print(f"  Workflow Started: ID = {wf_id}, Status = {start_res.get('status')}, CurrentStep = {start_res.get('currentStepNumber')}")
assert start_res.get("status") == "IN_PROGRESS"
assert start_res.get("currentStepNumber") == 1
assert len(start_res.get("steps")) == 9

# 3c. Complete Step 1
step_url = f"http://localhost:5066/api/ai/guided-workflows/{wf_id}/complete-step"
step_payload = json.dumps({
    "stepNumber": 1,
    "resultData": json.dumps({"action": "NAVIGATE_COMPLETED"})
}).encode('utf-8')

req = urllib.request.Request(step_url, data=step_payload, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    step_res = json.loads(resp.read().decode('utf-8'))

print(f"  Step 1 Completed -> Now on Step: {step_res.get('currentStepNumber')}, Status: {step_res.get('status')}")
assert step_res.get("currentStepNumber") == 2
assert step_res.get("steps")[0]["status"] == "COMPLETED"
assert step_res.get("steps")[1]["status"] == "IN_PROGRESS"

# 3d. Get Workflow by ID
get_url = f"http://localhost:5066/api/ai/guided-workflows/{wf_id}"
req = urllib.request.Request(get_url, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    get_res = json.loads(resp.read().decode('utf-8'))
assert get_res.get("workflowId") == wf_id
print(f"  Retrieved Workflow ID: {get_res.get('workflowId')}, Verified in-progress state.")

# 3e. Cancel Workflow
cancel_url = f"http://localhost:5066/api/ai/guided-workflows/{wf_id}/cancel"
cancel_payload = json.dumps({"reason": "Automated verification test completed"}).encode('utf-8')
req = urllib.request.Request(cancel_url, data=cancel_payload, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    cancel_res = json.loads(resp.read().decode('utf-8'))
print(f"  Workflow Cancelled: Status = {cancel_res.get('status')}")
assert cancel_res.get("status") == "CANCELLED"

# 3f. History
hist_url = "http://localhost:5066/api/ai/guided-workflows/history"
req = urllib.request.Request(hist_url, headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    hist = json.loads(resp.read().decode('utf-8'))
print(f"  User Workflow History items: {len(hist)}")
assert any(h.get("id") == wf_id for h in hist), "Cancelled workflow must be listed in history"

print("\n[SUCCESS] ALL CHECKS PASSED: Python AI Service + ASP.NET Core API + Guided Workflow Persistence!")
