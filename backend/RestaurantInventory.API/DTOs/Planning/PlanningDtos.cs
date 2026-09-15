namespace RestaurantInventory.API.DTOs.Planning;

public class DemandPlanResponse
{
    public Guid Id { get; set; }
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string SKU { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public decimal WeeklyForecast { get; set; }
    public decimal DailyAverageDemand { get; set; }
    public decimal CurrentStock { get; set; }
    public decimal MinimumStockLevel { get; set; }
    public decimal MaximumStockLevel { get; set; }
    public decimal ProjectedStock { get; set; }
    public decimal ProjectedShortage { get; set; }
    public decimal StockCoverageDays { get; set; }
    public bool ReorderRequired { get; set; }
    public decimal RecommendedOrderQuantity { get; set; }
    public string Recommendation { get; set; } = "NO_REORDER";
    public string RiskStatus { get; set; } = "NORMAL";
    public decimal? ConfidenceScore { get; set; }
    public string GeneratedBy { get; set; } = "RULE_BASED";
    public string Reason { get; set; } = string.Empty;
}

public class PlanningRecommendationResponse
{
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string SKU { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal CurrentStock { get; set; }
    public decimal WeeklyForecast { get; set; }
    public decimal MinimumStockLevel { get; set; }
    public decimal MaximumStockLevel { get; set; }
    public decimal ProjectedStock { get; set; }
    public decimal Shortage { get; set; }
    public decimal RecommendedOrderQuantity { get; set; }
    public string Recommendation { get; set; } = "NO_REORDER";
    public string Reason { get; set; } = string.Empty;
}

public class PlanningRiskSummaryResponse
{
    public int TotalIngredients { get; set; }
    public int StockRiskCount { get; set; }
    public int HighDemandCount { get; set; }
    public int OverstockRiskCount { get; set; }
    public int ReorderRequiredCount { get; set; }
    public List<DemandPlanResponse> RiskItems { get; set; } = new();
}
