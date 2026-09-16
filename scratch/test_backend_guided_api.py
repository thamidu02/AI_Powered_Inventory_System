import urllib.request
import json

print("=== Testing ASP.NET Core Guided Workflow API Directly ===")

# 1. Login as INVENTORY_MANAGER
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

print(f"  Authenticated: {login_data.get('user', {}).get('email')} ({login_data.get('user', {}).get('role')})")
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}

# 2. Get Definitions
req = urllib.request.Request("http://localhost:5066/api/ai/guided-workflows/definitions", headers=headers)
with urllib.request.urlopen(req) as resp:
    defs = json.loads(resp.read().decode('utf-8'))
print(f"  Definitions available: {[d['workflowType'] for d in defs]}")
assert any(d["workflowType"] == "RECEIVE_STOCK" for d in defs)

# 3. Start RECEIVE_STOCK
req = urllib.request.Request("http://localhost:5066/api/ai/guided-workflows/start",
    data=json.dumps({"workflowType": "RECEIVE_STOCK"}).encode('utf-8'),
    headers=headers)
with urllib.request.urlopen(req) as resp:
    start_res = json.loads(resp.read().decode('utf-8'))

wf_id = start_res["workflowId"]
print(f"  Started Workflow: ID={wf_id}, Status={start_res['status']}, CurrentStep={start_res['currentStepNumber']}, TotalSteps={start_res['totalSteps']}")
assert start_res["currentStepNumber"] == 1
assert start_res["totalSteps"] == 9

# 4. Complete Step 1
req = urllib.request.Request(f"http://localhost:5066/api/ai/guided-workflows/{wf_id}/complete-step",
    data=json.dumps({"stepNumber": 1, "resultData": "{\"tab\":\"inventory\"}"}).encode('utf-8'),
    headers=headers)
with urllib.request.urlopen(req) as resp:
    step_res = json.loads(resp.read().decode('utf-8'))

print(f"  Completed Step 1 -> Current Step is now: {step_res['currentStepNumber']}")
assert step_res["currentStepNumber"] == 2

# 5. Complete Step 2
req = urllib.request.Request(f"http://localhost:5066/api/ai/guided-workflows/{wf_id}/complete-step",
    data=json.dumps({"stepNumber": 2, "resultData": "{\"openedModal\":\"receive\"}"}).encode('utf-8'),
    headers=headers)
with urllib.request.urlopen(req) as resp:
    step_res = json.loads(resp.read().decode('utf-8'))
print(f"  Completed Step 2 -> Current Step is now: {step_res['currentStepNumber']}")
assert step_res["currentStepNumber"] == 3

# 6. Cancel
req = urllib.request.Request(f"http://localhost:5066/api/ai/guided-workflows/{wf_id}/cancel",
    data=json.dumps({"reason": "API test complete"}).encode('utf-8'),
    headers=headers)
with urllib.request.urlopen(req) as resp:
    cancel_res = json.loads(resp.read().decode('utf-8'))
print(f"  Workflow Cancelled: Status={cancel_res['status']}")
assert cancel_res["status"] == "CANCELLED"

# 7. Verify History
req = urllib.request.Request("http://localhost:5066/api/ai/guided-workflows/history", headers=headers)
with urllib.request.urlopen(req) as resp:
    hist = json.loads(resp.read().decode('utf-8'))
print(f"  User History count: {len(hist)}")
assert any(h["id"] == wf_id for h in hist)

print("\nSUCCESS: All ASP.NET Core Guided Workflow API endpoints functioning perfectly!")
