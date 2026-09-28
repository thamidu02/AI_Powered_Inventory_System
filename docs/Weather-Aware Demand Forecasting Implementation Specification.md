# Weather-Aware AI/ML Demand Forecasting Integration

## Project Context

This project is an AI-powered restaurant inventory management system.

The current Demand & Planning functionality has already been migrated from rule-based demand calculations to an AI/ML-based demand forecasting pipeline.

The current system:

1. Retrieves historical demand/sales data from the database.
2. Uses the historical data to train/update the demand forecasting model.
3. Generates ingredient/food demand predictions.
4. Uses the latest available database data when forecasting.
5. The model is expected to improve over time as more historical data becomes available.
6. The Python AI service is responsible for the AI/ML forecasting functionality.
7. The .NET backend provides the business/data APIs.
8. The frontend displays the Demand & Planning dashboard.

The team has also established a strict tool ownership architecture:

```text
ai-service/
└── tools/
    ├── demand.py
    ├── inventory.py
    ├── sales.py
    ├── procurement_compliance.py
    └── __init__.py
```

Each team member owns their respective tool file.

### IMPORTANT TOOL OWNERSHIP RULE

Do NOT move, duplicate, or recreate existing inventory, sales, or procurement tools inside `demand.py`.

`demand.py` must contain only functionality that is genuinely required for Demand & Planning and ML demand forecasting.

Existing inventory tools remain in:

```text
ai-service/tools/inventory.py
```

Existing sales tools remain in:

```text
ai-service/tools/sales.py
```

Existing procurement tools remain in:

```text
ai-service/tools/procurement_compliance.py
```

The unified registry in:

```text
ai-service/tools/__init__.py
```

must continue to aggregate the existing component registries.

Do NOT remove:

```python
INVENTORY_TOOL_DISPATCH
SALES_TOOL_DISPATCH
PROCUREMENT_TOOL_DISPATCH
```

or their corresponding tool definitions.

---

# Objective

Add weather-aware demand forecasting to the existing AI/ML demand forecasting pipeline.

Weather conditions can influence restaurant demand.

Examples:

- Rain may increase demand for some hot foods.
- Very hot weather may increase demand for cold drinks.
- Temperature changes can affect specific food categories.
- Weather conditions can affect customer traffic and purchasing behavior.

The goal is therefore to allow the demand forecasting system to consider weather information when producing demand predictions.

The weather system must be integrated into the existing architecture without breaking the currently working demand, inventory, sales, procurement, chatbot, or dashboard functionality.

---

# Core Requirement

The final forecasting pipeline should conceptually become:

```text
Historical Database Data
        +
Weather Data / Weather Forecast
        ↓
Feature Preparation
        ↓
ML Demand Forecasting Model
        ↓
Base Demand Prediction
        ↓
Weather-aware prediction / explanation
        ↓
Demand & Planning Dashboard
```

The existing ML forecasting system remains the primary forecasting mechanism.

Weather should be treated as an additional predictive feature/context.

Do NOT replace the ML model with a purely rule-based weather multiplier system.

---

# Current Weather Architecture

The project already has a backend WeatherService.

The WeatherService currently:

- retrieves weather information
- caches weather information
- calculates weather-related demand multipliers

The weather system and AI forecasting system are currently separate.

The objective of this task is to connect them safely.

Before changing anything, inspect the existing WeatherService implementation and determine:

1. Where weather data is retrieved.
2. What weather fields are already available.
3. Whether weather forecast data is already available.
4. How weather data is cached.
5. How weather location is configured.
6. How weather multipliers are currently calculated.
7. Which controller/service currently calls WeatherService.
8. What DTOs currently represent weather data.
9. Whether the Planning API already has access to weather information.

Do not create a second weather service if an existing one already provides the required functionality.

---

# Phase 1 — Inspect Existing Implementation

Before modifying code, inspect the complete existing flow.

At minimum inspect:

```text
backend/
    RestaurantInventory.API/
        Controllers/
        Services/
        DTOs/
        Models/
```

and:

```text
ai-service/
    agent.py
    tools/
    ml/
```

Especially inspect:

```text
PlanningController.cs
PlanningService.cs
PlanningDtos.cs
WeatherService.cs
```

and the current demand forecasting implementation in:

```text
ai-service/agent.py
ai-service/tools/demand.py
ai-service/ml/
```

Also inspect:

```text
frontend/restaurant-web/
```

for the existing Demand & Planning dashboard.

Do not assume filenames or method names.

Use the existing project structure.

---

# Phase 2 — Determine the Existing Weather Data Contract

Before writing new DTOs, determine what the existing WeatherService already returns.

Prefer existing fields such as:

```text
temperature
humidity
rain
rainfall
weather condition
wind speed
forecast date
weather description
```

Only add new fields when they are actually required.

Do not duplicate weather models unnecessarily.

If the WeatherService already provides a suitable DTO, reuse it.

If a forecast DTO already exists, reuse it.

---

# Phase 3 — Weather Data Must Reach the ML Pipeline

The current demand prediction receives historical demand information.

Extend the existing forecasting request so that weather information can also be provided.

Conceptually:

```json
{
  "historicalDemand": [...],
  "forecastPeriod": {
    "from": "...",
    "to": "..."
  },
  "weather": {
    "condition": "...",
    "temperature": 0,
    "humidity": 0,
    "rainfall": 0,
    "forecastDate": "..."
  }
}
```

IMPORTANT:

Use the project's existing request/response models where possible.

Do not blindly create a completely new API contract if an existing planning request DTO can be extended safely.

---

# Phase 4 — Historical Weather vs Current Weather

For accurate ML forecasting, distinguish between:

### Historical demand

Used for model training.

Example:

```text
2026-08-01
Chicken demand = 20 kg
Temperature = 27°C
Rainfall = 0
Condition = Clear
```

```text
2026-08-02
Chicken demand = 25 kg
Temperature = 23°C
Rainfall = 12 mm
Condition = Rain
```

and so on.

### Future weather

Used for future prediction.

Example:

```text
2026-09-29
Temperature = 21°C
Rainfall = 18 mm
Condition = Rain
```

The model should ideally learn relationships between:

```text
past demand
+
past weather
```

and predict:

```text
future demand
```

using:

```text
future weather forecast
```

---

# IMPORTANT ML REQUIREMENT

Do not simply send today's weather to Gemini and claim that the ML model is weather-aware.

The weather should actually be represented as a feature when training/predicting with the ML model where technically appropriate.

The desired conceptual feature set is:

```text
date
day_of_week
ingredient/product
historical demand
lag demand features
rolling demand features
temperature
humidity
rainfall
weather condition
```

Use only features that are supported by the actual existing dataset and weather API.

Do not fabricate historical weather values.

---

# Phase 5 — Historical Weather Data

This is one of the most important requirements.

The project currently has only approximately 1–2 months of demand data.

The model is designed to improve as more data becomes available.

Therefore:

```text
New database demand data
        ↓
New weather data
        ↓
Training dataset grows
        ↓
Model retrains/updates
        ↓
Prediction improves over time
```

If historical weather data is already stored in the database, use it.

If historical weather data is NOT stored, do not pretend that current weather can represent historical weather.

Instead:

1. Inspect whether the existing WeatherService/API provides historical weather.
2. Inspect whether weather data is persisted anywhere.
3. If historical weather persistence is already available, use it.
4. If it is not available, implement the smallest safe persistence mechanism required for the ML dataset.
5. Do not introduce a large unrelated database redesign.

The implementation must clearly distinguish:

```text
observed historical weather
```

from:

```text
future weather forecast
```

---

# Phase 6 — Model Training

The existing model retraining behavior must be preserved.

The intended behavior is:

```text
User requests demand forecast
        ↓
Retrieve latest available demand history
        ↓
Retrieve corresponding weather features
        ↓
Prepare training dataset
        ↓
Train/update model
        ↓
Generate forecast
        ↓
Return prediction
```

As more data becomes available:

```text
Month 1 → small training dataset
Month 2 → larger dataset
Month 3 → larger dataset
Month 6 → significantly larger dataset
...
```

The model should therefore have access to increasingly larger historical datasets.

Do not hard-code a small fixed dataset.

Do not train only once and permanently use the first model.

Do not remove the current retraining/update mechanism.

---

# Phase 7 — Avoid Data Leakage

Weather integration must not introduce future-data leakage.

For example:

Do NOT use actual observed weather from tomorrow when generating tomorrow's prediction if that information would not have been available at prediction time.

For future prediction:

```text
Use weather forecast available at prediction time.
```

For historical training:

```text
Use weather observations corresponding to the historical date.
```

Maintain the chronological relationship.

---

# Phase 8 — Weather Influence

The response should expose weather influence separately from the base ML prediction.

The response should conceptually contain:

```json
{
  "predictedDemand": 25.4,
  "confidence": 0.82,
  "weatherInfluence": {
    "condition": "Rain",
    "temperature": 22,
    "rainfall": 14,
    "impact": "increased",
    "explanation": "Forecasted rainfall is associated with increased demand for this item."
  }
}
```

Use the project's existing response structure if one already exists.

Do not introduce duplicate response models unnecessarily.

---

# Phase 9 — Weather Influence Must Be Explainable

The system should be able to explain:

1. What weather information was considered.
2. Whether the weather was associated with increased/decreased/no meaningful effect.
3. Which weather variables were relevant.
4. The base ML prediction.
5. The final weather-aware prediction, if they are different.

Example:

```text
Base ML demand: 20 units

Weather:
Rain expected
Temperature: 21°C

Weather influence:
Expected to increase demand

Final forecast:
24 units
```

Do not invent causal claims.

If the model has not learned a statistically meaningful relationship from the available data, say so.

For example:

```text
Weather data available, but insufficient historical observations to establish a reliable weather-demand relationship.
```

This is especially important because the project currently has only approximately 1–2 months of data.

---

# Phase 10 — Do Not Overclaim Accuracy

The system must NOT claim:

```text
Weather increased accuracy by 20%.
```

unless the model has actually been evaluated and that improvement is measured.

The correct approach is to compare:

### Model A

Demand model without weather.

### Model B

Demand model with weather features.

Evaluate using appropriate metrics already used by the project, such as:

```text
MAE
RMSE
MAPE
R²
```

Use whatever metrics are already implemented.

Then determine whether weather improves the model.

If the dataset is too small, report that limitation.

---

# Phase 11 — Fallback Behavior

Weather must never make the Demand & Planning dashboard completely unusable.

If weather API fails:

```text
Demand forecasting continues without weather features
```

or uses the safest existing fallback supported by the project.

If historical weather is unavailable:

```text
Do not fabricate weather data.
```

If future weather forecast is unavailable:

```text
Generate the normal ML demand forecast.
```

The API should return a clear status such as:

```text
weatherAvailable = false
```

if the existing response architecture supports this.

---

# Phase 12 — Existing Weather Multipliers

The existing WeatherService currently calculates rule-based weather multipliers.

Do NOT automatically stack these multipliers on top of an ML model without evaluating the consequences.

For example, avoid blindly doing:

```text
ML prediction × weather multiplier
```

because the ML model may already have learned weather influence.

This could result in double-counting weather effects.

The preferred architecture is:

```text
Weather features
        ↓
ML model
        ↓
Weather-aware prediction
```

The existing deterministic multiplier logic should remain available if other parts of the system depend on it, but do not apply it to the ML forecast unless the existing architecture explicitly requires it and the effect is validated.

If a post-processing multiplier is required by the existing business logic, clearly separate:

```text
ML prediction
```

from:

```text
business-rule adjustment
```

and do not pretend the adjusted result is purely an ML prediction.

---

# Phase 13 — Backend Changes

Potential files may include:

```text
PlanningController.cs
PlanningService.cs
PlanningDtos.cs
WeatherService.cs
Weather DTOs
```

Only modify files that actually require changes.

Expected responsibility:

### PlanningController

Responsible for receiving the forecast request and coordinating the existing planning flow.

### PlanningService

Responsible for retrieving:

```text
demand history
weather information
```

and passing the required information into the AI/ML forecasting layer.

### WeatherService

Continue owning weather retrieval/caching.

Do not duplicate weather API calls in unrelated services.

### DTOs

Extend existing DTOs only where necessary.

---

# Phase 14 — Python AI Service

The Python AI service should accept the weather context through the existing demand forecasting pathway.

Potential files:

```text
ai-service/agent.py
ai-service/tools/demand.py
ai-service/ml/
```

Do not move inventory tools into `demand.py`.

Do not move sales tools into `demand.py`.

Do not move procurement tools into `demand.py`.

Only modify demand-related functionality.

The existing unified registry in:

```text
ai-service/tools/__init__.py
```

must continue to preserve all component registries.

Never remove:

```python
INVENTORY_TOOL_DISPATCH
SALES_TOOL_DISPATCH
PROCUREMENT_TOOL_DISPATCH
```

from the architecture.

---

# Phase 15 — Do Not Break the Current Tool Architecture

Current ownership:

```text
inventory.py
    ↓
Inventory AI tools

sales.py
    ↓
Sales AI tools

procurement_compliance.py
    ↓
Procurement AI tools

demand.py
    ↓
Demand/ML-specific tools only
```

The package registry:

```text
tools/__init__.py
```

aggregates these component registries.

Weather forecasting does NOT require moving existing tools between files.

If a new weather-specific tool is genuinely required, first determine whether it belongs to the backend WeatherService rather than the AI tool registry.

Do not create duplicate weather tools just to expose existing backend functionality.

---

# Phase 16 — Frontend

Update the existing Demand & Planning dashboard only after the backend and ML pipeline are working.

Potential UI additions:

```text
Weather:
Rainy
22°C
14 mm rainfall expected
```

and:

```text
Weather Influence:
Moderate increase
```

Each forecast card may optionally display:

```text
Predicted demand
Confidence
Weather influence
```

Do not redesign the entire dashboard.

Keep the existing UI structure.

Make the smallest UI changes necessary.

---

# Phase 17 — Dashboard Example

Conceptually:

```text
Demand & Planning

Weather Forecast
--------------------------------
☔ Rain expected
Temperature: 22°C
Rainfall: 14 mm
--------------------------------

Chicken
Predicted Demand: 24 kg
Confidence: 82%

Weather Influence:
Moderate increase
Reason:
Rainfall is associated with increased demand
for this item based on available historical data.
```

The exact UI should follow the existing project's design.

---

# Phase 18 — Model Metadata

If the existing ML system already stores:

```text
model_metadata.json
```

extend it only if useful.

Possible metadata:

```json
{
  "features": [
    "historical_demand",
    "temperature",
    "humidity",
    "rainfall",
    "weather_condition"
  ],
  "weather_enabled": true,
  "trained_at": "...",
  "training_samples": 0
}
```

Do not break the existing metadata format.

If the current metadata structure is incompatible, preserve backwards compatibility where possible.

---

# Phase 19 — Model File

The project currently has model artifacts such as:

```text
ai-service/models/demand_model.joblib
ai-service/models/model_metadata.json
```

Do not delete or unnecessarily regenerate these files.

If the implementation retrains the model automatically, verify whether generated model artifacts are intentionally tracked by Git.

Do not commit large/generated files unless the project's existing Git strategy requires them.

Follow the current repository convention.

---

# Phase 20 — Testing

Test the following scenarios.

### Test 1 — Normal forecast

```text
Demand history available
Weather available
```

Expected:

```text
Weather-aware forecast succeeds.
```

### Test 2 — Weather unavailable

Expected:

```text
Demand forecast still succeeds.
```

### Test 3 — Small historical dataset

Expected:

```text
System does not crash.
```

If weather data is insufficient:

```text
Weather influence should be marked unavailable/low confidence.
```

### Test 4 — More historical data

Add/use additional records and verify:

```text
training sample count increases
```

and the model is retrained/updated according to the existing architecture.

### Test 5 — Sales chatbot

Verify existing sales tools still work.

### Test 6 — Inventory chatbot

Verify existing inventory tools still work.

### Test 7 — Procurement chatbot

Verify procurement tools still work.

### Test 8 — Demand dashboard

Verify:

```text
Demand forecast
weather information
confidence
weather influence
```

work together.

### Test 9 — AI service startup

Run:

```powershell
powershell -ExecutionPolicy Bypass -File ..\start-ai-service.ps1
```

Confirm there are no import errors.

---

# Phase 21 — Regression Protection

Before finishing, verify that the weather implementation has NOT caused:

- inventory tool failures
- sales tool failures
- procurement tool failures
- chatbot tool failures
- demand dashboard failures
- planning API failures
- authentication failures
- AI service startup failures
- database migration problems

Especially verify:

```text
tools/__init__.py
```

because this is the central registry.

---

# Phase 22 — Git Commit Strategy

This project requires a meaningful commit history.

DO NOT finish the entire feature and then create one huge commit.

Create small, logical commits.

Do NOT use:

```powershell
git add .
```

for these commits.

Stage specific files.

Example commit structure:

```text
1. Inspect/prepare weather forecast contract
2. Extend planning DTO for weather context
3. Integrate WeatherService with planning service
4. Pass weather data to AI forecasting
5. Add weather features to ML preprocessing
6. Update demand model training
7. Add weather-aware prediction output
8. Add weather fallback handling
9. Update planning dashboard weather display
10. Add weather forecasting tests
```

Use the actual changed files for each commit.

Do not create fake commits simply to increase commit count.

Each commit should represent a real logical change.

---

# Phase 23 — Git Safety

This project is shared with other team members.

Before committing:

```powershell
git status
```

Before pushing:

```powershell
git fetch origin
```

If the team has updated `main`, update your local branch safely.

Do not overwrite teammates' work.

Never use destructive commands such as:

```powershell
git reset --hard
git push --force
```

unless explicitly required and confirmed.

When conflicts occur, preserve the correct component ownership.

In particular, never resolve a conflict by simply deleting:

```python
INVENTORY_TOOL_DISPATCH
SALES_TOOL_DISPATCH
PROCUREMENT_TOOL_DISPATCH
```

Those registries belong to other team members.

---

# Phase 24 — Final Architecture

The intended final architecture is:

```text
                    DATABASE
                       │
                       │
              Historical Demand
                       │
                       ▼
              ┌─────────────────┐
              │ Feature Builder │
              └─────────────────┘
                       ▲
                       │
              Historical Weather
                       │
                       │
              ┌─────────────────┐
              │  WeatherService │
              └─────────────────┘
                       ▲
                       │
                 Weather API
                       │
                       ▼

              Future Weather Forecast
                       │
                       ▼
             ┌────────────────────┐
             │ Demand ML Pipeline │
             │                    │
             │ Demand features    │
             │ + weather features │
             └────────────────────┘
                       │
                       ▼
              Demand Prediction
                       │
                       ▼
             Weather Influence
                 Explanation
                       │
                       ▼
             .NET Planning API
                       │
                       ▼
             Demand & Planning UI
```

---

# Critical Safety Rules

Before making any change, follow these rules.

## Rule 1

Do not rewrite working demand functionality unnecessarily.

## Rule 2

Do not move inventory tools into `demand.py`.

## Rule 3

Do not move sales tools into `demand.py`.

## Rule 4

Do not move procurement tools into `demand.py`.

## Rule 5

Do not remove component dispatch registries.

## Rule 6

Do not duplicate WeatherService.

## Rule 7

Do not fabricate historical weather data.

## Rule 8

Do not apply weather multipliers on top of an ML prediction unless explicitly validated.

## Rule 9

Do not claim weather improves accuracy unless evaluation proves it.

## Rule 10

Weather failure must not break normal demand forecasting.

## Rule 11

Do not break existing chatbot functionality.

## Rule 12

Do not make unrelated changes to other team members' code.

## Rule 13

Preserve existing API contracts where possible.

## Rule 14

Use small logical commits.

## Rule 15

Never use `git add .` for the implementation commits.

---

# Definition of Done

The implementation is complete only when:

- [ ] Existing ML demand forecasting still works.
- [ ] Latest demand data is still used.
- [ ] Model retraining/update behavior is preserved.
- [ ] Weather data reaches the demand forecasting pipeline.
- [ ] Historical weather is used for training when available.
- [ ] Future weather forecast is used for future predictions when available.
- [ ] Weather is represented as ML features where appropriate.
- [ ] No future-data leakage is introduced.
- [ ] Weather influence is returned separately/explainably.
- [ ] Weather failure does not break demand forecasting.
- [ ] Existing WeatherService remains the source of weather data.
- [ ] Inventory tools still work.
- [ ] Sales tools still work.
- [ ] Procurement tools still work.
- [ ] `tools/__init__.py` still aggregates all component registries.
- [ ] No existing team member's tool ownership is broken.
- [ ] Demand & Planning dashboard displays weather information.
- [ ] Tests pass.
- [ ] AI service starts successfully.
- [ ] Backend starts successfully.
- [ ] Frontend works.
- [ ] Changes are split into logical Git commits.
- [ ] No `git add .` was used for the feature commits.
- [ ] No force push is performed.
- [ ] No unrelated files are modified unnecessarily.

---

# Final Instruction to Antigravity

Before editing anything:

1. Inspect the current implementation.
2. Identify the exact existing WeatherService and demand ML flow.
3. Identify the current request/response contracts.
4. Identify where weather data already exists.
5. Identify the smallest set of files that must change.
6. Explain the proposed changes.
7. Preserve all existing functionality and team-owned code.
8. Only then implement the changes.

Do not blindly follow the example filenames above if the repository uses different names.

The existing repository is the source of truth.

The priority is:

```text
Existing working functionality
        >
Minimal safe changes
        >
Weather integration
        >
UI enhancement
```

Do not sacrifice existing functionality just to add weather forecasting.