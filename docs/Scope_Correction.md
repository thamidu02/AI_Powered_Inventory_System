# Scope Correction — Demand & Planning Agentic AI Integration

## IMPORTANT: READ THIS BEFORE MAKING ANY CHANGES

This task is **NOT** a request to rebuild, redesign, or reimplement the existing Demand & Planning / ML forecasting system.

The existing Demand & Planning system is already implemented and working.

The purpose of this task is ONLY to add the **individual Agentic AI capability required for the Demand & Planning component** by extending the existing AI Assistant/chatbot with Demand & Planning-specific tools.

Do not unnecessarily modify the existing ML forecasting pipeline, weather forecasting system, Sales Agent, Inventory Agent, Procurement Agent, or unrelated components.

---

# 1. Existing System — DO NOT REBUILD

The following functionality already exists:

- Demand & Planning dashboard
- ML-based demand forecasting
- Historical sales/demand data processing
- ML feature engineering
- Model training
- Model evaluation
- Forecast generation
- Weather-related forecasting/influence functionality
- Existing AI Assistant/chatbot
- Existing tool registry
- Existing Sales tools
- Existing Inventory tools
- Existing Procurement tools
- Existing Agentic/AI infrastructure

The existing ML model should remain responsible for **predicting demand**.

The new Agentic AI functionality should sit **on top of the existing system**.

---

# 2. What We Actually Need to Implement

We need to give the existing AI Assistant **Demand & Planning-specific tools**.

The agent should be able to receive a natural-language request from the user and decide when it needs to call one or more Demand & Planning tools.

Example:

> "Do we need to purchase 90 kg of chicken for next week?"

The AI Assistant should be able to:

1. Understand the user's request.
2. Identify that this is a Demand & Planning question.
3. Call the appropriate existing Demand/Planning tools.
4. Retrieve the required forecast/data.
5. Retrieve relevant inventory/stock information if necessary.
6. Compare the requested quantity against predicted demand/requirements.
7. Consider relevant factors already available to the system, including weather influence where applicable.
8. Reason about the result.
9. Give the user a clear recommendation.

Example response concept:

> "Based on the predicted demand for next week, approximately 82 kg of chicken is expected to be required. Current available stock is 15 kg. Purchasing 90 kg would provide more than the predicted requirement. I recommend purchasing approximately X kg, subject to the current stock and safety requirements."

The exact numbers must come from the real system data. Do NOT hard-code example values.

---

# 3. This Is NOT a New Chatbot

Do NOT create:

- A second chatbot
- A separate chat UI
- A separate AI assistant
- A second FastAPI service
- A separate Gemini integration
- A duplicate forecasting system

Use the **existing AI Assistant/chatbot**.

We only extend its available tools and, where necessary, its routing/instructions.

The existing chatbot must continue to support:

- Sales-related requests
- Inventory-related requests
- Procurement-related requests
- Existing workflows
- Existing tools

The new Demand & Planning tools must be added without breaking any existing tools.

---

# 4. Agentic AI Requirement

The purpose of the implementation is to demonstrate actual Agentic AI behaviour.

The agent should not simply answer:

> "90 kg should be enough."

Instead, it should have access to tools that allow it to obtain current information and make a decision.

The basic architecture should be:

```text
User
 |
 | "Do we need to purchase 90 kg of chicken for next week?"
 ↓
Existing AI Assistant
 |
 | Understand intent
 ↓
Demand & Planning Tool
 |
 | Retrieve ML forecast
 ↓
Forecast / Demand Data
 |
 | If necessary
 ↓
Inventory / Stock Tool
 |
 | Retrieve current stock
 ↓
AI Agent Reasoning
 |
 ↓
Actionable Recommendation
```

This is the important distinction:

### ML

The ML model answers:

> "What is the expected demand?"

### Agentic AI

The agent answers:

> "Given the predicted demand, current stock, and the user's proposed purchase quantity, should we purchase that amount?"

The ML model is therefore a **tool/data source used by the Agentic AI**, rather than being considered the Agentic AI itself.

---

# 5. Demand & Planning Tools

First inspect the existing Demand & Planning implementation.

Do NOT automatically create new tools if existing tools already provide the required information.

Identify which existing tools can provide:

- Demand forecast
- Forecast for a specific ingredient
- Forecast for a date range
- Historical demand
- Current stock
- Ingredient information
- Planning/reorder information
- Weather influence where already available

Reuse existing tools whenever possible.

Only create a new Demand & Planning tool if the required Agentic AI operation genuinely cannot be performed using the existing tools.

---

# 6. Suggested Agentic Tools

If equivalent tools do not already exist, consider a small set of focused tools such as:

### Tool 1 — Get Demand Forecast

Purpose:

Retrieve the ML-generated demand prediction for an ingredient/date range.

Example conceptual request:

```text
get_demand_forecast(
    ingredient="Chicken",
    start_date="...",
    end_date="..."
)
```

Do not duplicate an existing function if one already provides this capability.

---

### Tool 2 — Get Planning Context

Purpose:

Retrieve information needed to make a planning decision, such as:

- Current stock
- Predicted demand
- Existing planned quantity
- Relevant safety stock
- Other already-supported planning information

Again, reuse existing tools where possible.

---

### Tool 3 — Evaluate Purchase Requirement

If the existing system does not already provide an equivalent capability, create a focused tool that allows the agent to evaluate a proposed purchase.

Example:

```text
evaluate_purchase_requirement(
    ingredient="Chicken",
    proposed_quantity=90,
    period="next week"
)
```

The tool should obtain real system data rather than using hard-coded assumptions.

The final recommendation should be produced by the Agentic AI using the returned information.

Do NOT turn this into another ML model.

---

# 7. Important Separation of Responsibilities

Maintain the existing ownership structure.

### Demand & Planning

Responsible for:

- ML demand prediction
- Forecasting
- Demand-related planning information
- Weather influence on forecasting where already implemented
- Demand-specific Agentic AI tools

### Sales Agent

Owned by the other team member.

Do NOT rewrite or replace Sales tools.

### Inventory Agent

Owned by the other team member.

Do NOT rewrite or replace Inventory tools.

### Procurement Agent

Owned by the other team member.

Do NOT rewrite or replace Procurement tools.

The Demand Agent may **use existing Inventory/Procurement tools through the existing agent architecture when appropriate**, but do not move those tools into Demand & Planning or duplicate their implementations.

---

# 8. Existing Tool Registry Must Be Preserved

This is extremely important.

The project already contains multiple tool modules.

Do NOT remove:

```python
INVENTORY_TOOL_DISPATCH
```

or:

```python
SALES_TOOL_DISPATCH
```

or:

```python
PROCUREMENT_TOOL_DISPATCH
```

Do not remove existing tool definitions belonging to other team members.

Do not duplicate their tools inside `demand.py`.

The architecture should remain modular:

```text
ai-service/tools/

    demand.py
        → Demand & Planning-specific tools only

    inventory.py
        → Inventory tools owned by the Inventory component

    sales.py
        → Sales tools owned by the Sales component

    procurement_compliance.py
        → Procurement tools owned by the Procurement component

    guided_workflows.py
        → Existing workflow functionality

    __init__.py
        → Unified registry/aggregation
```

If a Demand Agent needs an Inventory or Procurement capability, use the existing registered tool rather than copying its implementation into `demand.py`.

---

# 9. Quick Actions

We also want to expose Demand & Planning Agentic AI through one or more quick-action buttons in the EXISTING AI Assistant interface.

Do NOT create another chat interface.

Possible quick actions:

```text
Check Next Week's Demand
```

```text
Should We Purchase?
```

```text
Analyze Demand & Stock
```

```text
Explain Forecast
```

The exact buttons should be based on the existing UI architecture.

When the user clicks a quick action, it should send a predefined natural-language request to the existing AI Assistant.

For example:

```text
"Analyze next week's demand and identify ingredients that may require additional purchasing."
```

The existing agent then decides which tools to call.

---

# 10. Natural Language Must Also Work

Quick actions are optional convenience features.

The user must also be able to type a normal request.

Examples:

```text
Do we need to purchase 90 kg of chicken for next week?
```

```text
How much chicken will we need next week?
```

```text
Which ingredients are likely to run short next week?
```

```text
Should I increase the purchase quantity for chicken?
```

```text
What ingredients should I purchase for next week based on predicted demand?
```

The existing AI Assistant should route these requests to the appropriate Demand & Planning tools.

---

# 11. Weather

The existing weather functionality should NOT be rebuilt.

If weather information is already available to the forecasting system, the Agentic AI should be able to use the existing weather-aware forecast/result.

The agent may explain weather influence when relevant.

For example:

```text
"Rain is expected during the forecast period, and the demand forecast reflects the available weather information."
```

However:

- Do not create a second weather service.
- Do not duplicate weather APIs.
- Do not create a second weather prediction model.
- Do not change the existing weather system unless absolutely necessary for the Agentic AI integration.

First inspect how the current weather system works.

---

# 12. What Counts as Agentic AI for This Component?

The implementation should demonstrate the following behaviour:

```text
User request
      ↓
LLM interprets request
      ↓
Determines required tool(s)
      ↓
Calls real system tools
      ↓
Receives real data
      ↓
Reasons over the returned data
      ↓
Produces recommendation/explanation
```

This is the Agentic AI capability.

The agent should have the ability to choose the appropriate tool based on the user's request rather than always returning a static response.

---

# 13. Do Not Hard-Code Business Decisions

Avoid code such as:

```python
if chicken:
    recommend_90kg()
```

or:

```python
weather == "rain":
    demand *= 1.2
```

unless that logic already exists in the established system and is intentionally being reused.

The Agentic AI should use the actual forecast and system data.

The existing ML model remains responsible for demand prediction.

The agent is responsible for interpreting the available information and making a useful planning recommendation.

---

# 14. Testing Requirements

After implementation, test both:

### Natural-language requests

Examples:

```text
Do we need to purchase 90 kg of chicken for next week?
```

```text
How much chicken will we need next week?
```

```text
Which ingredients may need additional purchasing next week?
```

```text
Why is chicken demand expected to increase?
```

### Quick actions

Verify that every new Demand & Planning quick action:

1. Sends a request to the existing AI Assistant.
2. Reaches the existing agent.
3. Selects the appropriate Demand/Planning tool.
4. Retrieves real data.
5. Produces a meaningful response.

Also verify that existing:

- Sales requests
- Inventory requests
- Procurement requests

continue working.

Do not break the other team members' functionality.

---

# 15. Files to Inspect Before Editing

Before making any changes, inspect the existing implementation and identify the minimum required files.

Likely areas include:

```text
ai-service/
    agent.py
    tools/
        demand.py
        inventory.py
        sales.py
        procurement_compliance.py
        __init__.py
        guided_workflows.py

backend/
    ... existing Planning/Demand controllers/services/DTOs ...

frontend/
    restaurant-web/
        ... existing AI Assistant components ...
        ... existing Planning Dashboard components ...
```

Do NOT assume these exact files need modification.

First trace the existing architecture.

Then modify only the minimum necessary files.

---

# 16. Critical Safety Rules

Because other team members are working on this repository:

### DO

- Preserve existing Sales tools.
- Preserve existing Inventory tools.
- Preserve existing Procurement tools.
- Preserve existing tool dispatch maps.
- Reuse existing Demand/ML functionality.
- Reuse existing weather functionality.
- Make small, isolated changes.
- Test after each meaningful change.
- Keep the existing chatbot architecture.

### DO NOT

- Create another chatbot.
- Create another AI service.
- Rebuild the ML forecasting pipeline.
- Move Sales tools into Demand.
- Move Inventory tools into Demand.
- Move Procurement tools into Demand.
- Duplicate existing tools.
- Delete existing dispatch maps.
- Replace other team members' implementations.
- Hard-code forecast values.
- Hard-code purchase recommendations.

---

# 17. Git Commit Requirement

This work must be completed using **small, logical commits**.

Do NOT use:

```bash
git add .
```

Instead stage only the files belonging to each logical change.

For example:

```bash
git add ai-service/tools/demand.py
git commit -m "Add demand planning agent tool"
```

Then another logical change:

```bash
git add ai-service/agent.py
git commit -m "Integrate demand tools with AI agent"
```

Then frontend quick actions:

```bash
git add frontend/restaurant-web/<specific-file>
git commit -m "Add demand planning quick actions"
```

Use separate commits for separate responsibilities.

Before pushing:

```bash
git status
```

Verify there are no unintended files.

Because this is a shared repository, do not modify or commit unrelated work belonging to other team members.

---

# 18. Expected Final Result

The final architecture should look conceptually like this:

```text
                         EXISTING AI ASSISTANT
                                  |
                                  ↓
                         Gemini / AI Agent
                                  |
             ┌────────────────────┼────────────────────┐
             ↓                    ↓                    ↓
       Sales Tools          Inventory Tools      Procurement Tools
       [Existing]             [Existing]             [Existing]
                                  |
                                  ↓
                         Demand & Planning
                                  |
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
              ML Forecast                 Existing Weather
                    |                           |
                    └─────────────┬─────────────┘
                                  ↓
                         Agentic Reasoning
                                  ↓
                    Planning Recommendation
```

Example:

```text
User:
"Do we need to purchase 90 kg of chicken for next week?"

                ↓

Existing AI Assistant

                ↓

Recognizes Demand & Planning intent

                ↓

Calls demand forecast tool

                ↓

Gets predicted demand

                ↓

Calls existing inventory tool if required

                ↓

Gets current stock

                ↓

Considers available weather-aware forecast information

                ↓

Agent reasons over the information

                ↓

"Based on the predicted demand and current stock,
90 kg is / is not recommended. The recommended
quantity is approximately X kg."
```

This is the specific Agentic AI capability required for the Demand & Planning component.

---

# 19. Final Instruction

Before modifying anything:

1. Inspect the existing Demand & Planning implementation.
2. Inspect the existing AI Assistant architecture.
3. Inspect the current tool registry.
4. Inspect existing Demand, Inventory, Sales, and Procurement tools.
5. Identify which Demand tools already exist.
6. Reuse them wherever possible.
7. Identify the minimum missing capability required for the Agentic AI requirement.
8. Implement only that missing capability.
9. Add Demand & Planning quick actions to the existing AI Assistant if the current UI architecture supports them.
10. Test natural-language Demand & Planning questions.
11. Test the quick actions.
12. Test existing Sales, Inventory, and Procurement requests to ensure nothing was broken.
13. Make small separate Git commits for each logical change.
14. Do NOT use `git add .`.
15. Do NOT change unrelated files.

The objective is **not to rebuild Demand & Planning**.

The objective is:

> **Add Demand & Planning-specific Agentic AI capabilities to the existing AI Assistant so the user can ask planning questions naturally or use quick actions, while the agent uses the existing ML forecast and system tools to produce data-driven recommendations.**