# Automated Test Suites

This directory contains automated unit and integration tests for the Restaurant Inventory System backend components.

## Test Projects

### 1. Component 1: Inventory & Stock Management (`RestaurantInventory.Component1.Tests`)
Unit tests covering domain rules and business logic for Component 1:
- Stock Receipt with Maximum Stock Level constraints and past expiry rejection
- FEFO (First-Expired, First-Out) consumption order validation
- Expired batch exclusion from consumption
- Waste recording with batch depletion and stock movement logging
- Two-Man Rule Stock Adjustments (threshold-based auto-approval vs. managerial approval/rejection)
- Storage location stock transfers and same-location guard checks
- Low stock threshold detection and horizon-based expiring stock queries

Run tests:
```bash
dotnet test tests/RestaurantInventory.Component1.Tests/RestaurantInventory.Component1.Tests.csproj
```

### 2. Component 3: Kitchen & Menu Integration (`RestaurantInventory.Component3.Tests`)
Unit tests covering kitchen prep status calculations, auto-deduction triggers, and prep recipe requirements.

Run tests:
```bash
dotnet test tests/RestaurantInventory.Component3.Tests/RestaurantInventory.Component3.Tests.csproj
```

### 3. Component 1: Inventory AI Agent & Guided Workflows (`ai-service/tests`)
Unit tests covering Component 1's Inventory AI Agent MCP tools and interactive guided workflows:
- Interactive guided workflow planning and schema validation
- Target element allow-lists and route security boundaries
- Low-stock aggregation, deficits, and threshold queries
- Horizon-based batch expiry queries and temporal filtering
- In-memory bearer token caching and tool execution dispatcher

Run tests:
```bash
cd ai-service
python tests/run_inventory_agent_tests.py
```

## Running All Backend Tests
```bash
dotnet test tests/RestaurantInventory.Component1.Tests/RestaurantInventory.Component1.Tests.csproj
dotnet test tests/RestaurantInventory.Component3.Tests/RestaurantInventory.Component3.Tests.csproj
```
