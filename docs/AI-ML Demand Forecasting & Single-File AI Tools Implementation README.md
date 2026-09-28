# AI-Powered Restaurant Inventory & Procurement Management System

# AI/ML Demand Forecasting + AI Service Tool Consolidation

## Antigravity / GitHub Copilot Implementation README

---

# 1. Purpose

This document defines the implementation requirements for adding an actual AI/ML demand forecasting system to the existing AI-Powered Restaurant Inventory & Procurement Management System.

The current Component 4 demand logic is primarily rule-based.

The new implementation must introduce an ML-based demand forecasting pipeline that uses the existing database data instead of relying only on manually defined demand formulas.

The ML system must continuously use the latest available historical data.

The main objective is:

```text
Existing Database Data
        ↓
Data Extraction
        ↓
Data Preparation
        ↓
Feature Engineering
        ↓
ML Model Training
        ↓
Model Evaluation
        ↓
Demand Prediction
        ↓
Inventory Planning
        ↓
Reorder Recommendation
```

The ML prediction must eventually replace or improve the current rule-based demand prediction.

---

# 2. Important Project Context

This is a group project.

My responsibility is:

```text
Component 4
Demand
+
Analytics
+
Inventory Planning
+
AI/ML Demand Forecasting
+
Replenishment Recommendation
```

My branch:

```text
chamath
```

Do not redesign or replace other team members' components.

Do not modify unrelated components unless an integration change is strictly required.

Always inspect the existing repository before making changes.

---

# 3. Current Component 4

Component 4 currently exists in the .NET backend.

Important existing files include:

```text
backend/RestaurantInventory.API/
├── Controllers/
│   └── PlanningController.cs
│
├── Services/
│   ├── Interfaces/
│   │   └── IPlanningService.cs
│   │
│   └── Planning/
│       └── PlanningService.cs
│
├── Models/
│   └── Planning/
│       └── DemandPlan.cs
│
└── DTOs/
    └── Planning/
        └── PlanningDtos.cs
```

The current project also contains:

```text
ai-service/
├── agent.py
├── main.py
├── requirements.txt
└── tools/
    ├── inventory.py
    ├── sales.py
    ├── guided_workflows.py
    └── __init__.py
```

---

# 4. Existing Rule-Based Demand Logic

The current Component 4 implementation already performs demand analysis.

The current flow is approximately:

```text
Ingredients
      ↓
Historical SaleItems
      ↓
MenuItem
      ↓
Recipe
      ↓
RecipeIngredients
      ↓
Ingredient Consumption
      ↓
Weekday / Weekend Analysis
      ↓
Average Demand
      ↓
Predicted Demand
      ↓
DemandPlan
```

The important consumption equation is:

```text
Ingredient Consumption
=
SaleItem.Quantity
×
RecipeIngredient.QuantityRequired
```

Example:

```text
5 burgers
×
0.25 kg chicken per burger
=
1.25 kg chicken consumption
```

Therefore, demand is measured in the ingredient's own unit.

For example:

```text
Chicken Breast
Unit = kg
Demand = 1.75 kg
```

This does NOT mean 1.75 burgers.

The existing model property is:

```csharp
RecipeIngredient.QuantityRequired
```

Do NOT create or use:

```csharp
RecipeIngredient.Quantity
```

unless the actual repository contains such a property.

---

# 5. Existing Rule-Based Prediction

The current implementation calculates weekday and weekend demand.

Conceptually:

```text
Monday-Friday
    ↓
Weekday Demand

Saturday-Sunday
    ↓
Weekend Demand
```

The current prediction uses the higher average:

```text
Predicted Demand
=
max(
    Average Weekday Demand,
    Average Weekend Demand
)
```

The current implementation is therefore a rule-based demand indicator.

The purpose of the new ML system is to improve this prediction using historical patterns from the actual database.

Do NOT delete the existing implementation immediately.

The existing rule-based method should initially remain available as:

```text
RULE_BASED
```

while the ML method becomes:

```text
ML
```

This allows the ML model to be evaluated against the existing baseline.

---

# 6. New AI/ML Requirement

The main new requirement is:

> Predict future food/ingredient demand using machine learning based on historical database data.

The system must NOT simply calculate demand using a fixed formula.

Instead:

```text
Database
   ↓
Historical Sales
   ↓
Recipe Mapping
   ↓
Ingredient Consumption
   ↓
Daily Dataset
   ↓
Feature Engineering
   ↓
ML Model
   ↓
Future Demand
```

The prediction should be generated for ingredients because the inventory and procurement system operates at ingredient level.

Example:

```text
Historical:

Chicken:
Day 1 → 2.0 kg
Day 2 → 2.5 kg
Day 3 → 1.8 kg
Day 4 → 3.1 kg
...

ML Model
    ↓

Next 7 days:
Day 1 → 2.6 kg
Day 2 → 2.8 kg
Day 3 → 2.4 kg
Day 4 → 3.0 kg
...
```

The system should then calculate:

```text
7-Day ML Demand
=
Sum of predicted daily ingredient demand
```

---

# 7. Very Important: Limited Initial Data

At the beginning of the project, the database may contain only:

```text
1 month
or
2 months
```

of historical data.

Therefore, the implementation MUST NOT assume that years of historical data already exist.

The ML pipeline must work with the data currently available.

However, the system must also be designed so that it becomes more useful as additional historical data accumulates.

Expected lifecycle:

```text
Month 1
Small dataset
     ↓
Initial ML model

Month 2
More historical data
     ↓
Retrain / evaluate model

Month 3
More historical data
     ↓
Retrain / evaluate model

Month 6
Much larger dataset
     ↓
Better training foundation

Month 12
Large historical dataset
     ↓
More reliable seasonal / weekly patterns
```

IMPORTANT:

Do not claim:

> "Accuracy will automatically become higher just because more data exists."

Instead, measure actual model performance.

More representative historical data can allow the model to learn more patterns, but model accuracy must be evaluated using validation/test data.

---

# 8. Dynamic Data Requirement

The ML system must always use the latest available database data.

Do NOT hardcode a CSV dataset permanently.

Do NOT train only once and assume that the model will remain correct forever.

The database is the source of truth.

The intended architecture is:

```text
Database
   ↓
Latest Historical Data
   ↓
Dataset Builder
   ↓
Feature Engineering
   ↓
Train / Retrain Model
   ↓
Evaluate Model
   ↓
Save Latest Model
   ↓
Prediction
```

Whenever new historical data is available, the system must have a way to retrain or refresh the model.

---

# 9. Important Clarification About Retraining

Do NOT blindly retrain the model every time a user requests a prediction.

That would create unnecessary processing and could make the application slow.

Instead, implement a controlled retraining strategy.

Recommended approach:

```text
User requests forecast
        ↓
Check latest database data
        ↓
Check model training timestamp / latest training data timestamp
        ↓
Has meaningful new data arrived?
        ↓
YES ---------------- NO
 ↓                    ↓
Retrain             Use latest model
 ↓
Evaluate
 ↓
Save model
 ↓
Predict
```

The system should be designed so that retraining can occur:

- when new daily data is available
- when a configured amount of new data is added
- when the previous model becomes stale
- manually through an admin/development endpoint if required

For the first implementation, keep the retraining logic simple and reliable.

Do not introduce complex MLOps infrastructure unless required.

---

# 10. Recommended Initial ML Approach

Because the current dataset may only contain 1–2 months of data, start with a lightweight supervised regression approach.

Recommended first model:

```text
Random Forest Regressor
```

Alternative models can later be evaluated:

```text
Linear Regression
Random Forest
Gradient Boosting
XGBoost
LightGBM
Time-Series Models
Neural Networks
```

Do NOT immediately introduce a neural network.

The initial objective is:

```text
Reliable
+
Explainable
+
Easy to train
+
Works with limited data
+
Easy to evaluate
```

A simpler model is preferable for the first implementation.

---

# 11. ML Target

The target variable should represent:

```text
Daily ingredient consumption
```

Example training record:

```text
date = 2026-09-20
ingredient_id = chicken-id
ingredient_name = Chicken Breast
day_of_week = 6
is_weekend = true
sales_quantity = ...
ingredient_consumption = 2.45
```

Target:

```text
ingredient_consumption
```

The model learns:

```text
Features
   ↓
Daily Ingredient Consumption
```

---

# 12. Dataset Construction

The ML dataset should be generated from actual database records.

Do not create fake training data.

Potential data sources include:

```text
Sales
SaleItems
MenuItems
Recipes
RecipeIngredients
Consumption movements
Waste records
Inventory
Purchases
Supplier information
```

The existing project documentation confirms that Component 4 consumes data from inventory, sales/sale items, recipes/recipe ingredients, consumption/waste, and supplier/purchase history where available.

Only use fields that actually exist in the current repository/database.

Do NOT invent database columns.

---

# 13. Daily Dataset

The raw sales data should be transformed into daily ingredient-level demand.

Example:

```text
Raw SaleItems

2026-09-20
Burger × 10
Pizza × 5
```

Recipes:

```text
Burger
Chicken = 0.25 kg

Pizza
Chicken = 0.15 kg
```

Ingredient demand:

```text
Chicken consumption
=
(10 × 0.25)
+
(5 × 0.15)

=
3.25 kg
```

Training dataset:

```text
Date        Ingredient       Demand
2026-09-20  Chicken Breast   3.25 kg
```

This daily aggregation is extremely important.

The ML model should not simply train directly on unrelated raw database rows.

---

# 14. Recommended Features

The initial feature set should include only features supported by the actual data.

Possible features:

```text
date
day_of_week
day_of_month
month
week_of_year
is_weekend
ingredient_id
historical_demand
lag_1
lag_2
lag_3
lag_7
rolling_mean_3
rolling_mean_7
rolling_mean_14
sales_quantity
waste_quantity
current_stock
purchase_quantity
supplier_lead_time
holiday
promotion
```

However:

IMPORTANT:

Only implement features for which reliable data exists.

Do not create fake values.

---

# 15. Minimum Initial Feature Set

Because the current database may only have 1–2 months of data, start with a smaller feature set.

Recommended:

```text
day_of_week
is_weekend
day_of_month
month
ingredient_id
lag_1
lag_7
rolling_mean_7
```

If sufficient historical records exist, add:

```text
sales_quantity
waste_quantity
current_stock
```

Later, if the database contains reliable information:

```text
holiday
promotion
supplier_lead_time
purchase_quantity
```

can be included.

---

# 16. Lag Features

Historical demand is highly useful for demand forecasting.

Example:

```text
lag_1
=
yesterday's demand

lag_7
=
demand seven days ago
```

Example:

```text
Monday:
5 kg

Next Monday:
previous 7-day demand = 5 kg
```

This allows the model to learn weekly patterns.

Potential features:

```text
lag_1
lag_2
lag_3
lag_7
lag_14
```

Do not create a lag feature when there is insufficient history.

Handle missing lag values properly.

Do not replace missing historical values with arbitrary numbers.

---

# 17. Rolling Features

Potential rolling features:

```text
rolling_mean_3
rolling_mean_7
rolling_mean_14
```

Example:

```text
Previous 7 days:

2.0
2.5
1.8
3.0
2.4
2.2
2.8

Rolling mean:
14.7 / 7
=
2.10 kg/day
```

These features help the model understand recent demand trends.

Again:

Only create a rolling window when enough historical records are available.

---

# 18. Training Per Ingredient

The preferred initial architecture is to predict ingredient demand.

There are two possible approaches:

### Option A — One model per ingredient

```text
Chicken model
Rice model
Oil model
Flour model
...
```

Advantages:

- Simple concept
- Each ingredient has its own demand pattern

Disadvantage:

- Ingredients with very little history cannot train reliable models.

### Option B — One global model

```text
All ingredients
       ↓
Single ML model
       ↓
ingredient_id as feature
```

Advantages:

- Can share information across ingredients
- Better for sparse ingredients

For the first implementation, inspect the amount of historical data per ingredient before deciding.

Do not create separate models for ingredients with insufficient historical data.

---

# 19. Minimum Data Requirement

The system must check whether enough historical data exists.

Example policy:

```text
< 7 daily records
    ↓
Insufficient data

7–13 records
    ↓
Very limited ML prediction

14+ records
    ↓
ML can be attempted

30+ records
    ↓
Better initial training foundation
```

These thresholds are implementation guidelines, not claims of statistical validity.

The system should expose the actual number of training records used.

If there is insufficient data:

```text
ML prediction unavailable
```

Then use the existing rule-based baseline if appropriate.

The system must NOT generate fake predictions.

---

# 20. ML + Rule-Based Fallback

The system should have a safe fallback.

Recommended flow:

```text
Request Forecast
       ↓
Enough ML training data?
       ↓
     YES
       ↓
Train / load ML model
       ↓
Model valid?
       ↓
 YES → ML prediction

 NO
 ↓
Rule-based prediction
```

Therefore:

```text
ML_AVAILABLE
ML
RULE_BASED
INSUFFICIENT_DATA
```

can be used as prediction source/status values where appropriate.

The final API response should clearly indicate whether the prediction came from:

```text
ML
```

or:

```text
RULE_BASED
```

---

# 21. Model Evaluation

Do not simply train the model and assume it is accurate.

The model must be evaluated.

Possible metrics:

```text
MAE
RMSE
MAPE
R²
```

Recommended initial metric:

```text
MAE
```

Mean Absolute Error:

```text
MAE =
average(
    |actual - predicted|
)
```

Example:

```text
Actual:
10 kg

Predicted:
8 kg

Error:
2 kg
```

The system should record evaluation metrics.

Example:

```text
Model:
RandomForestRegressor

Training Records:
245

Validation Records:
52

MAE:
0.42 kg

RMSE:
0.61 kg
```

Do not invent these values.

---

# 22. Time-Based Train/Test Split

Do NOT randomly shuffle time-series data before splitting.

Use chronological splitting.

Example:

```text
Historical Data

January
February
March
April
May

Training:
January → April

Testing:
May
```

This better represents the real-world forecasting situation.

The model must predict the future using only information available before that future period.

Avoid data leakage.

---

# 23. Data Leakage Prevention

This is extremely important.

Do NOT allow future demand information to enter the training features.

For example:

If predicting:

```text
September 25 demand
```

do not use:

```text
September 26 demand
```

as a feature.

Similarly, rolling and lag calculations must only use historical records.

---

# 24. Weekly Forecast

The existing Component 4 system already has a 7-day planning concept.

The new ML system should produce:

```text
Day 1 prediction
Day 2 prediction
Day 3 prediction
Day 4 prediction
Day 5 prediction
Day 6 prediction
Day 7 prediction
```

Then:

```text
Weekly ML Forecast
=
sum(
    Day 1
    ...
    Day 7
)
```

Example:

```text
Chicken:

Monday      2.1 kg
Tuesday     2.4 kg
Wednesday   2.2 kg
Thursday    2.7 kg
Friday      3.1 kg
Saturday    3.5 kg
Sunday      2.9 kg

7-Day Forecast = 18.9 kg
```

This weekly forecast should be passed to inventory planning.

---

# 25. Inventory Planning Integration

The ML system should NOT own the entire procurement workflow.

The architecture remains:

```text
ML Forecast
      ↓
Ingredient Demand
      ↓
Current Stock
      ↓
Projected Stock
      ↓
Shortage
      ↓
Reorder Recommendation
      ↓
Component 3 Procurement
```

Existing planning concepts include:

```text
ProjectedStock
ProjectedShortage
MinimumStockLevel
MaximumStockLevel
RecommendedOrderQuantity
Recommendation
RiskStatus
```

The ML model changes the demand input.

It should not duplicate the procurement workflow.

---

# 26. Example ML Planning

Example:

```text
Ingredient:
Chicken Breast

Current Stock:
10 kg

ML Weekly Forecast:
16 kg

Minimum Stock:
20 kg
```

Projected stock:

```text
10 - 16
=
-6 kg
```

Therefore:

```text
Projected shortage:
6 kg

Recommendation:
REORDER
```

The recommendation should be based on the actual inventory rules already implemented in the project.

Do not create conflicting procurement logic.

---

# 27. Prediction Response

The API/service should eventually be capable of returning information similar to:

```json
{
  "ingredientId": "...",
  "ingredientName": "Chicken Breast",
  "unit": "kg",
  "forecastPeriodDays": 7,
  "predictedDemand": 16.4,
  "dailyPredictions": [
    2.1,
    2.4,
    2.2,
    2.7,
    3.1,
    3.2,
    2.7
  ],
  "predictionSource": "ML",
  "modelType": "RandomForestRegressor",
  "trainingRecords": 245,
  "mae": 0.42
}
```

This is an example structure only.

Inspect the existing DTOs before creating or modifying response models.

Do NOT blindly copy this JSON structure.

---

# 28. AI Service Architecture

The existing AI service is:

```text
ai-service/
├── main.py
├── agent.py
├── requirements.txt
└── tools/
    ├── inventory.py
    ├── sales.py
    ├── guided_workflows.py
    └── __init__.py
```

The project currently uses Python/FastAPI for the AI service and communicates with the .NET backend through authenticated REST API calls.

Preserve this architecture.

---

# 29. IMPORTANT: Single AI Tools File Requirement

The team has decided that the `tools` directory should use ONE main tool file instead of maintaining separate tool files for each member's AI functionality.

Current:

```text
tools/
├── inventory.py
├── sales.py
├── guided_workflows.py
└── __init__.py
```

Target structure:

```text
tools/
├── tools.py
├── guided_workflows.py
└── __init__.py
```

The new `tools.py` should contain the existing AI tool functions currently distributed between:

```text
inventory.py
sales.py
```

This means:

```text
inventory.py
    ↓
tools.py

sales.py
    ↓
tools.py
```

All inventory-related tools and sales/consumption/waste-related tools must coexist in the single file.

---

# 30. Single tools.py Organization

Organize the file clearly.

Recommended structure:

```python
"""
Central AI tools for the Restaurant Inventory AI Service.

Contains:
- Backend authentication
- Shared HTTP helpers
- Inventory tools
- Sales tools
- Consumption tools
- Waste tools
- Recipe tools
- Demand / forecasting tools
- Tool definitions
- Tool dispatch
"""
```

Then:

```text
Configuration
↓
Authentication
↓
Shared HTTP helpers
↓
Inventory tools
↓
Sales tools
↓
Consumption tools
↓
Waste tools
↓
Recipe tools
↓
Demand forecasting tools
↓
Tool definitions
↓
Tool dispatch
```

Do not create duplicate HTTP/authentication implementations.

---

# 31. Existing Inventory Tools

The existing inventory tool functions must be preserved.

Examples currently include functionality for:

```text
get_all_stock_levels
list_all_ingredients
get_ingredient_details
get_ingredient_stock
```

There are additional inventory functions in the existing file.

Before moving them:

1. Inspect the complete `inventory.py`.
2. Identify every public tool.
3. Move the required functions to `tools.py`.
4. Preserve their function names.
5. Preserve their parameters.
6. Preserve their return structures.
7. Preserve their tool declarations.
8. Preserve their dispatch mapping.

Do not accidentally remove any existing AI capability.

---

# 32. Existing Sales Tools

The current `sales.py` contains read-only Component 3 tools.

These include functionality for:

```text
get_sales_summary
get_sales_records
get_component3_waste_summary
get_component3_waste_records
get_recipes
get_consumption_movements
build_component3_report
```

These tools must continue to work after consolidation.

They are read-only.

Do not change them into write operations.

---

# 33. Preserve Component 3 Read-Only Protection

The current system defines:

```text
COMPONENT3_READ_ONLY_TOOLS
```

Preserve this behavior.

The following types of operations must remain read-only:

```text
Sales
Consumption
Waste
Recipes
Historical records
```

The AI must not modify sales or waste records through these tools.

---

# 34. New Demand Forecasting Tools

Add demand/ML tools to the central `tools.py`.

Possible tools:

```text
get_demand_history
build_demand_dataset
train_demand_model
evaluate_demand_model
predict_demand
get_demand_forecast
```

Do not necessarily expose every internal function to Gemini.

Separate:

```text
Internal ML functions
```

from:

```text
AI-callable tools
```

Only expose functions that are actually useful to the AI agent.

---

# 35. Recommended ML Module Separation

Although the team wants a single `tools.py` file for AI tools, do NOT put the entire ML implementation into one enormous function.

Recommended structure:

```text
ai-service/
├── main.py
├── agent.py
├── requirements.txt
├── ml/
│   ├── __init__.py
│   ├── dataset.py
│   ├── features.py
│   ├── model.py
│   └── evaluation.py
└── tools/
    ├── tools.py
    ├── guided_workflows.py
    └── __init__.py
```

The requirement is:

```text
ONE AI TOOL FILE
```

It does NOT mean:

```text
ONE PYTHON FILE FOR EVERYTHING
```

Keep ML implementation modular.

The `tools.py` file should call the ML modules.

Example:

```text
Gemini
  ↓
tools.py
  ↓
ml/model.py
  ↓
Dataset
  ↓
Database
```

This keeps the project maintainable.

---

# 36. Database Access for ML

Prefer using the existing .NET backend APIs rather than directly connecting the Python AI service to PostgreSQL unless there is a strong technical reason.

Current AI service architecture already uses:

```text
AI Service
   ↓
Authenticated HTTP
   ↓
.NET Backend
   ↓
Database
```

Preserve this architecture.

The ML pipeline can request:

```text
Sales
Recipes
Consumption
Waste
Inventory
Purchases
```

through existing or newly created backend APIs.

Do not bypass existing authorization/business rules unnecessarily.

---

# 37. New Backend API Requirement

If the existing APIs do not provide enough historical data to build the ML dataset, add the smallest necessary backend endpoint(s).

Possible endpoint:

```text
GET /api/Planning/demand-history
```

or:

```text
GET /api/Planning/forecast-data
```

However:

DO NOT automatically create these endpoints.

First inspect:

```text
SalesController
InventoryController
Recipe endpoints
PlanningController
```

and determine whether the required information can already be retrieved.

Only add an endpoint if necessary.

---

# 38. Date Range Handling

The existing AI service uses UTC date ranges.

Preserve this behavior.

Do not introduce inconsistent local-time calculations.

The current project already uses UTC handling in Component 4.

Maintain consistent:

```text
from
to
```

date filtering.

---

# 39. Model Storage

The trained model should not be retrained from zero unnecessarily.

Possible approach:

```text
ai-service/models/
    demand_model.joblib
```

or:

```text
models/
    demand_model.pkl
```

Use an appropriate serialization library such as `joblib`.

However:

Before adding model persistence, check the project's current environment and dependencies.

The saved model must contain enough metadata to determine:

```text
Training timestamp
Training data range
Training record count
Model type
Feature list
Evaluation metrics
```

Example metadata:

```json
{
  "trained_at": "...",
  "data_from": "...",
  "data_to": "...",
  "training_records": 245,
  "model_type": "RandomForestRegressor",
  "mae": 0.42
}
```

Do not hardcode these values.

---

# 40. Retraining Detection

The system should determine whether the saved model is outdated.

Possible logic:

```text
latest database record date
        >
model training data end date
```

Then:

```text
New data exists
    ↓
Retrain
```

Otherwise:

```text
No new data
    ↓
Reuse model
```

This prevents unnecessary retraining on every prediction request.

---

# 41. Retraining Strategy

Initial implementation:

```text
1. Load latest historical data.
2. Build daily ingredient dataset.
3. Check minimum data requirements.
4. Build features.
5. Split chronologically.
6. Train model.
7. Evaluate model.
8. Compare against baseline.
9. Save model only if valid.
10. Use latest valid model for prediction.
```

Never replace a valid existing model with a clearly worse model without an explicit reason.

---

# 42. Baseline Comparison

The existing rule-based prediction should act as a baseline.

For example:

```text
Rule-based MAE = 1.20 kg

ML MAE = 0.75 kg
```

ML is better.

But if:

```text
Rule-based MAE = 0.60 kg

ML MAE = 1.10 kg
```

do not automatically use the ML model.

Instead:

```text
Use rule-based fallback
```

until the ML model performs sufficiently well.

This is especially important with only 1–2 months of data.

---

# 43. Model Selection Rule

The initial model selection can be:

```text
Train ML model
        ↓
Evaluate ML
        ↓
Compare against rule-based baseline
        ↓
ML better?
   YES       NO
    ↓         ↓
Use ML    Use baseline
```

The system should report:

```text
predictionSource = ML
```

or:

```text
predictionSource = RULE_BASED
```

---

# 44. Handling New Ingredients

A new ingredient may have no historical sales.

Example:

```text
New Ingredient
↓
0 historical demand records
```

Do not predict arbitrary demand.

Return:

```text
INSUFFICIENT_DATA
```

or use the project's existing safe fallback behavior.

Do not generate fake training records.

---

# 45. Handling Zero Demand

If an ingredient genuinely has zero historical consumption:

```text
Demand = 0
```

Do not automatically convert zero to a random positive demand.

The existing Component 4 documentation explicitly says many ingredients currently return zero when no matching historical sales/recipe consumption records exist.

Preserve this behavior where appropriate.

---

# 46. Waste Data

Waste can potentially improve demand planning.

Example:

```text
Demand = 10 kg
Waste = 3 kg
```

But do not automatically treat waste as customer demand.

Separate:

```text
Sales-derived consumption
```

from:

```text
Waste
```

Potential features:

```text
waste_quantity
waste_rate
```

Only add these after verifying that the waste data is reliable.

---

# 47. Stock Data

Current stock should not be used as a direct target for demand.

Instead:

```text
Demand
```

is what the model predicts.

Then:

```text
Demand
+
Current Stock
```

is used for planning.

Potential feature:

```text
current_stock
```

may be used if there is a valid reason, but avoid allowing stock availability to distort true customer demand.

---

# 48. Forecasting vs Generative AI

Important distinction:

Gemini is already being used as the AI assistant.

However:

```text
Gemini
```

should NOT be responsible for numerical demand forecasting.

The architecture should be:

```text
Gemini
    ↓
Understands user request
    ↓
Calls demand forecasting tool
    ↓
ML model performs numerical prediction
    ↓
Structured result
    ↓
Gemini explains result
```

Therefore:

```text
LLM = conversational reasoning/interface

ML model = numerical demand forecasting
```

Do not ask Gemini to "guess" demand values.

---

# 49. Final AI Architecture

Target architecture:

```text
                         React Frontend
                              │
                              ▼
                       .NET Backend API
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        Existing Planning             AI Service
        / Inventory APIs                  │
                │                         │
                ▼                         ▼
            PostgreSQL                 Gemini
                │                         │
                │                         ▼
                │                    tools/tools.py
                │                         │
                │              ┌──────────┼──────────┐
                │              │          │          │
                │              ▼          ▼          ▼
                │         Inventory     Sales      ML Forecast
                │         Tools         Tools        Tools
                │                           │          │
                └───────────────────────────┼──────────┘
                                            │
                                            ▼
                                      ML Pipeline
                                            │
                                            ▼
                                     Demand Forecast
                                            │
                                            ▼
                                    Inventory Planning
                                            │
                                            ▼
                                   Reorder Recommendation
                                            │
                                            ▼
                                  Procurement Component
```

---

# 50. Target tools Directory

Final target:

```text
ai-service/
└── tools/
    ├── tools.py
    ├── guided_workflows.py
    └── __init__.py
```

Do not leave duplicate tool implementations in both:

```text
inventory.py
sales.py
```

after migration.

However, do not delete the existing files until:

1. All imports are migrated.
2. All tool definitions are migrated.
3. All dispatch mappings are migrated.
4. `agent.py` works.
5. `main.py` works.
6. AI tool calls are tested.
7. The application starts successfully.

Then remove the old files only if they are no longer referenced.

---

# 51. Update tools/__init__.py

After consolidation, update:

```text
tools/__init__.py
```

so that it imports from:

```text
.tools
```

instead of:

```text
.inventory
.sales
```

Example conceptual structure:

```python
from .tools import (
    TOOL_DEFINITIONS,
    TOOL_DISPATCH,
    COMPONENT3_READ_ONLY_TOOLS,
)
```

Preserve the public interface expected by:

```text
agent.py
```

Do not unnecessarily rewrite `agent.py`.

---

# 52. Agent Integration

The existing `agent.py` currently imports:

```python
from tools import TOOL_DEFINITIONS, call_tool
```

Preserve this interface if possible.

The objective is to make the internal tool organization change without breaking the agent.

The agent should be able to call:

```text
get_sales_summary
get_sales_records
get_recipes
get_consumption_movements
get_all_stock_levels
...
```

and new ML tools such as:

```text
get_demand_forecast
```

through the same central tool registry.

---

# 53. New Demand Tool Example

A possible AI-callable function:

```python
async def get_demand_forecast(
    days: int = 7,
    ingredient_id: str | None = None,
) -> dict:
    ...
```

The function should:

```text
1. Retrieve latest data.
2. Check model state.
3. Retrain if necessary.
4. Generate forecast.
5. Return structured prediction.
```

Do not expose raw model internals to Gemini unless required.

---

# 54. Structured ML Result

Return structured information such as:

```text
forecast_period
ingredient
unit
predicted_demand
daily_predictions
prediction_source
model_type
training_records
training_data_range
evaluation_metric
```

Only include fields that are actually available.

---

# 55. Confidence

Do NOT create a fake confidence score such as:

```text
confidence = 0.95
```

just because the model exists.

Confidence should only be provided if it is calculated using a defensible method.

Instead, initially provide:

```text
MAE
training_records
prediction_source
```

These are more transparent.

The existing Component 4 documentation also specifically warns not to fake confidence scores.

---

# 56. ML Dependencies

Check the current:

```text
ai-service/requirements.txt
```

before adding packages.

Possible dependencies:

```text
pandas
numpy
scikit-learn
joblib
```

Do not add unnecessary libraries.

Do not install XGBoost or neural-network frameworks unless they are actually required.

---

# 57. Python Version Compatibility

Inspect the existing AI service environment before selecting package versions.

The project already contains a Python virtual environment.

Do not blindly recreate the environment.

Check:

```text
python --version
pip list
requirements.txt
```

before modifying dependencies.

---

# 58. Error Handling

The ML system must fail safely.

Possible situations:

```text
Backend unavailable
No sales data
No recipes
No ingredient mapping
Insufficient history
Model training failure
Invalid feature data
Model loading failure
```

Return structured errors.

Do not crash the complete AI service.

Example:

```json
{
  "status": "INSUFFICIENT_DATA",
  "message": "Not enough historical demand data to train a reliable model."
}
```

---

# 59. No Fake Data

This is a strict requirement.

Never create:

```text
fake sales
fake demand
fake inventory
fake training records
fake accuracy
fake confidence
fake stock
```

If data does not exist:

```text
Insufficient data
```

must be returned.

---

# 60. Existing Frontend

Do not redesign the planning dashboard.

The current dashboard already displays concepts including:

```text
Ingredient / SKU
Current Stock
7-Day Demand Forecast
Projected Stock
Projected Shortage
Stock Coverage
Recommendation
Suggested Order Quantity
Status
Reason
```

The existing dashboard documentation describes the 7-day demand forecast and inventory calculations.

The main change should be:

```text
Current:
Rule-Based Forecast

New:
ML Forecast
```

The rest of the inventory planning flow should continue to work.

---

# 61. Preserve Existing Planning Calculations

Do not unnecessarily rewrite:

```text
ProjectedStock
ProjectedShortage
StockCoverageDays
RecommendedOrderQuantity
RiskStatus
```

The ML system should mainly provide a better:

```text
WeeklyForecast
```

Then existing planning logic can consume it.

---

# 62. Development Order

Implement the feature in stages.

Do NOT ask Antigravity to modify the entire system at once.

Recommended order:

```text
AI-ML-01
Inspect existing AI service and backend
```

↓

```text
AI-ML-02
Consolidate inventory.py + sales.py into tools.py
```

↓

```text
AI-ML-03
Create historical demand dataset
```

↓

```text
AI-ML-04
Create feature engineering pipeline
```

↓

```text
AI-ML-05
Implement ML training
```

↓

```text
AI-ML-06
Implement chronological evaluation
```

↓

```text
AI-ML-07
Implement model persistence
```

↓

```text
AI-ML-08
Implement automatic retraining detection
```

↓

```text
AI-ML-09
Implement 7-day demand prediction
```

↓

```text
AI-ML-10
Compare ML against rule-based baseline
```

↓

```text
AI-ML-11
Integrate ML forecast into Component 4
```

↓

```text
AI-ML-12
Integrate with inventory planning
```

↓

```text
AI-ML-13
Test complete flow
```

---

# 63. AI-ML-01 — Repository Inspection

Before modifying anything:

Inspect:

```text
ai-service/
backend/RestaurantInventory.API/
```

Especially:

```text
ai-service/agent.py
ai-service/main.py
ai-service/requirements.txt
ai-service/tools/inventory.py
ai-service/tools/sales.py
ai-service/tools/__init__.py

PlanningController.cs
PlanningService.cs
IPlanningService.cs
DemandPlan.cs
PlanningDtos.cs

SalesController
InventoryController
Recipe APIs
```

Then report:

```text
1. Existing architecture
2. Existing tools
3. Existing planning API
4. Existing data sources
5. Existing model properties
6. Files that need modification
7. Files that should remain untouched
```

Do not make changes until this inspection is complete.

---

# 64. AI-ML-02 — Consolidate Tools

Create:

```text
ai-service/tools/tools.py
```

Move:

```text
inventory.py
sales.py
```

functionality into it.

Preserve:

```text
function names
parameters
return structures
tool declarations
dispatch mappings
read-only restrictions
authentication
HTTP behavior
```

Then update:

```text
tools/__init__.py
```

and any necessary imports.

Run:

```powershell
cd ai-service
python -m py_compile tools/tools.py
python -m py_compile tools/__init__.py
```

Then start the AI service.

Do not proceed if existing tools are broken.

---

# 65. AI-ML-03 — Historical Dataset

Create an internal ML dataset builder.

Possible file:

```text
ai-service/ml/dataset.py
```

Responsibilities:

```text
Fetch historical sales
Fetch recipes
Fetch recipe ingredients
Calculate ingredient consumption
Aggregate by date + ingredient
Return pandas DataFrame
```

Expected conceptual dataset:

```text
date
ingredient_id
ingredient_name
unit
demand
```

Example:

```text
2026-09-20 | chicken | kg | 3.25
2026-09-21 | chicken | kg | 2.90
2026-09-22 | chicken | kg | 3.40
```

---

# 66. AI-ML-04 — Feature Engineering

Create:

```text
ai-service/ml/features.py
```

Responsibilities:

```text
date features
day-of-week
weekend flag
month
lag features
rolling averages
```

Ensure no future data leakage.

Return:

```text
X
y
metadata
```

---

# 67. AI-ML-05 — Model Training

Create:

```text
ai-service/ml/model.py
```

Responsibilities:

```text
Train model
Save model
Load model
Predict
```

Initial model:

```text
RandomForestRegressor
```

Use a fixed `random_state` for reproducibility.

Do not optimize hyperparameters aggressively at the beginning.

---

# 68. AI-ML-06 — Evaluation

Create:

```text
ai-service/ml/evaluation.py
```

Implement:

```text
MAE
RMSE
```

Use chronological validation.

Never use future records to train a model that is evaluated on those same records.

---

# 69. AI-ML-07 — Model Metadata

Save metadata together with the model.

Required metadata:

```text
model_type
trained_at
data_from
data_to
training_records
validation_records
MAE
RMSE
features
```

This is required for retraining decisions and debugging.

---

# 70. AI-ML-08 — Automatic Refresh

When a forecast is requested:

```text
Load model metadata
        ↓
Check latest database date
        ↓
Compare with training data end date
        ↓
New data?
   YES       NO
    ↓         ↓
 Retrain    Load model
```

Do not retrain unnecessarily.

---

# 71. AI-ML-09 — 7-Day Prediction

The forecast service should generate the next seven days.

Conceptually:

```text
Today
 ↓
Tomorrow
 ↓
+2
 ↓
+3
 ↓
+4
 ↓
+5
 ↓
+6
```

For each ingredient:

```text
Predict daily demand
```

Then:

```text
weekly forecast = sum(daily predictions)
```

Do not simply multiply one prediction by seven unless the model design explicitly requires that.

---

# 72. AI-ML-10 — Baseline Comparison

Calculate:

```text
Rule-Based MAE
```

and:

```text
ML MAE
```

using the same evaluation period.

Then:

```text
ML better?
    ↓
YES → ML
NO  → Rule-Based
```

The decision must be data-driven.

---

# 73. AI-ML-11 — Component 4 Integration

The current Component 4 planning service should eventually consume:

```text
ML Weekly Forecast
```

instead of only:

```text
Rule-Based Weekly Forecast
```

The architecture becomes:

```text
PlanningService
      ↓
Demand Forecast Provider
      ↓
ML Forecast
      ↓
if ML unavailable
      ↓
Rule-Based Forecast
```

Prefer an abstraction such as:

```text
IDemandForecastService
```

if it fits the existing architecture.

But first inspect the repository.

Do not create duplicate services if an equivalent abstraction already exists.

---

# 74. AI-ML-12 — Inventory Planning Integration

Once the ML forecast is available:

```text
ML Forecast
     ↓
Current Stock
     ↓
Projected Stock
     ↓
Shortage
     ↓
Reorder
```

The existing procurement recommendation logic should continue to work.

Component 4 recommends.

Component 3 owns procurement execution.

---

# 75. API Compatibility

Existing endpoint:

```text
GET /api/Planning/demand
```

must continue to work unless there is a strong reason to version/change it.

If possible, add the ML information to the existing response without breaking frontend consumers.

Possible fields:

```text
predictionSource
modelType
trainingRecords
forecastPeriod
```

Only add fields after inspecting the current DTO and frontend usage.

---

# 76. Testing

Test at multiple levels.

### Dataset test

Verify:

```text
sales
→ recipe
→ ingredient
→ daily demand
```

### Feature test

Verify:

```text
lag_1
lag_7
rolling_mean
```

### Model test

Verify:

```text
training succeeds
prediction succeeds
```

### Evaluation test

Verify:

```text
MAE
RMSE
```

### API test

Verify:

```text
GET /api/Planning/demand
```

### AI tool test

Verify:

```text
get_demand_forecast
```

### End-to-end test

Verify:

```text
Frontend
 ↓
.NET
 ↓
AI Service
 ↓
tools.py
 ↓
ML pipeline
 ↓
Database
```

---

# 77. Important Testing Scenarios

Test:

```text
1 month of data
```

```text
2 months of data
```

```text
new data added
```

```text
no new data
```

```text
new ingredient
```

```text
zero-demand ingredient
```

```text
insufficient history
```

```text
backend unavailable
```

```text
model unavailable
```

```text
invalid historical record
```

---

# 78. Performance Requirement

Do not train the model unnecessarily.

Bad:

```text
Every user request
      ↓
Train model
      ↓
Predict
```

Better:

```text
User request
      ↓
Check model freshness
      ↓
Existing valid model?
      ↓
YES → Predict

NO → Retrain → Save → Predict
```

This is especially important once the application receives more users.

---

# 79. Security

Never expose:

```text
SERVICE_ACCOUNT_PASSWORD
GEMINI_API_KEY
database credentials
```

through:

```text
API responses
logs
Git
frontend
```

Use:

```text
.env
```

and ensure secrets are not committed.

---

# 80. Git Rules

Work only on:

```text
chamath
```

Before changes:

```powershell
git status
git branch
```

After changes:

```powershell
git diff
```

Stage only relevant files.

Do NOT blindly use:

```powershell
git add .
```

Example:

```powershell
git add ai-service/tools/tools.py
git add ai-service/tools/__init__.py
git add ai-service/ml/
git commit -m "AI-ML-05 implement demand forecasting model"
git push origin chamath
```

Make separate commits for separate features.

---

# 81. Do Not Modify Unrelated Components

Do NOT redesign:

```text
Sales
Inventory
Procurement
Authentication
Frontend
```

unless an integration change is required.

If another component needs a change:

1. Explain why.
2. Identify the exact file.
3. Make the smallest possible change.
4. Preserve existing behavior.

---

# 82. Important Antigravity Rules

When implementing this README:

```text
1. Inspect before modifying.
2. Never invent properties.
3. Never invent endpoints.
4. Never invent database data.
5. Never fake model accuracy.
6. Never fake confidence.
7. Never create duplicate services.
8. Preserve existing functionality.
9. Keep Component 3 read-only tools read-only.
10. Keep procurement execution outside Component 4.
11. Use database data as the source of truth.
12. Prevent future-data leakage.
13. Use chronological evaluation.
14. Retrain only when meaningful new data exists.
15. Keep rule-based fallback.
16. Test every meaningful change.
17. Build/run after changes.
18. Work one feature at a time.
19. Commit separately.
20. Do not stage unrelated teammate files.
```

---

# 83. Final Expected Architecture

The final system should work approximately like this:

```text
                 DATABASE
                    │
       ┌────────────┼─────────────┐
       │            │             │
     Sales       Recipes        Waste
       │            │             │
       └────────────┼─────────────┘
                    │
                    ▼
           Historical Dataset
                    │
                    ▼
          Feature Engineering
                    │
                    ▼
             ML Forecast Model
                    │
          ┌─────────┴─────────┐
          │                   │
       Evaluate            Predict
          │                   │
          └─────────┬─────────┘
                    ▼
             7-Day Demand
                    │
                    ▼
             Current Stock
                    │
                    ▼
           Projected Stock
                    │
                    ▼
             Stock Risk
                    │
                    ▼
          Reorder Recommendation
                    │
                    ▼
          Procurement Component
```

---

# 84. Future Data Growth

The system should naturally improve its training foundation as more operational data accumulates.

Example:

```text
Initial:
30 days

       ↓

60 days

       ↓

90 days

       ↓

180 days

       ↓

365+ days
```

The model should always be retrained using the latest appropriate historical dataset.

This allows the system to eventually learn:

```text
Weekly patterns
Weekend patterns
Seasonal patterns
Long-term trends
Ingredient-specific demand
Changes in customer behavior
```

However, never state that accuracy is guaranteed to increase.

Always measure actual model performance.

---

# 85. Final User Experience

The inventory manager should eventually be able to ask:

```text
What will we need next week?
```

The system should respond using the actual ML forecast.

Example:

```text
Summary:
The system generated a 7-day ingredient demand forecast using the latest available historical data.

Current Situation:
• Chicken Breast:
  Current stock: 10 kg
  Predicted 7-day demand: 16.4 kg
  Minimum stock: 20 kg

Analysis:
• The ML model predicts approximately 16.4 kg demand for the next 7 days.
• Current stock is insufficient to cover the predicted demand and required minimum stock.

Recommendation:
• REORDER Chicken Breast.

Reason:
• Predicted demand exceeds the available stock position.

Prediction Source:
• ML

Model:
• Random Forest

Training Records:
• [actual value]

Model MAE:
• [actual value]

Required Action:
• Review and proceed with the recommended replenishment.

Approval:
• Manager approval required.
```

Never fabricate the numerical values.

---

# 86. MASTER INSTRUCTION FOR ANTIGRAVITY

Use this README as the implementation specification.

Start by inspecting the repository.

Do not immediately modify files.

First report:

```text
1. Current AI service structure
2. Current tools
3. Current Component 4 implementation
4. Current database/API data available for ML
5. Existing demand calculation
6. Existing DTOs
7. Existing planning endpoints
8. Exact files that need to change
9. Exact new files that should be created
10. Potential risks or compatibility issues
```

Then implement one feature at a time.

The first implementation priority is:

```text
AI-ML-01
Repository inspection
```

Then:

```text
AI-ML-02
Consolidate inventory.py and sales.py into tools.py
```

Then proceed with the ML pipeline.

Do not implement the entire roadmap in one uncontrolled change.

The final goal is:

```text
REAL DATABASE DATA
        ↓
DYNAMIC DATASET
        ↓
FEATURE ENGINEERING
        ↓
ML TRAINING
        ↓
MODEL EVALUATION
        ↓
MODEL REFRESH WHEN NEW DATA ARRIVES
        ↓
7-DAY DEMAND FORECAST
        ↓
INVENTORY PLANNING
        ↓
REORDER RECOMMENDATION
```

The ML model must improve or replace the existing rule-based demand calculation only when the evaluation demonstrates that it is appropriate.

The system must remain safe, explainable, data-driven, and compatible with the existing group project architecture.

---

# 87. Final Rule

Implement:

```text
ONE COMPONENT
+
ONE CENTRAL AI TOOLS FILE
+
REAL DATABASE DATA
+
DYNAMIC ML TRAINING
+
MODEL EVALUATION
+
SAFE RULE-BASED FALLBACK
+
7-DAY DEMAND FORECAST
+
INVENTORY PLANNING
```

Do not implement:

```text
Fake data
Fake accuracy
Fake confidence
Hardcoded demand
Unnecessary neural networks
Uncontrolled retraining
Duplicate tools
Duplicate services
Duplicate business logic
```

Main principle:

```text
USE THE DATA WE ACTUALLY HAVE.
LEARN FROM NEW DATA AS IT ARRIVES.
MEASURE THE MODEL.
FALL BACK SAFELY WHEN DATA IS INSUFFICIENT.
```