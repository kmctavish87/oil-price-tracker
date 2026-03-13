import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const eiaApiKey = process.env.EIA_API_KEY;
const oilPriceApiToken = process.env.OILPRICE_API_TOKEN;
const corsOrigin = process.env.CORS_ORIGIN || "*";

const SERIES = {
  wti: "PET.RWTC.D",
  brent: "PET.RBRTE.D",
};

const RANGES = {
  "1d": { points: 2, chartPoints: 1, label: "1 day" },
  "5d": { points: 5, chartPoints: 5, label: "5 days" },
  "30d": { points: 30, chartPoints: 30, label: "30 days" },
  "90d": { points: 90, chartPoints: 90, label: "90 days" },
  "1y": { points: 365, chartPoints: 365, label: "1 year" },
  "5y": { points: 1825, chartPoints: 1825, label: "5 years" },
  "10y": { points: 3650, chartPoints: 3650, label: "10 years" },
};

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((value) => value.trim()),
  })
);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "oil-price-tracker-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/oil", async (request, response) => {
  if (!eiaApiKey) {
    response.status(500).json({
      error: "Server is missing EIA_API_KEY.",
    });
    return;
  }

  try {
    const requestedRange = typeof request.query.range === "string" ? request.query.range : "30d";
    const rangeKey = requestedRange in RANGES ? requestedRange : "30d";
    const range = RANGES[rangeKey];
    const [wti, brent, livePrices] = await Promise.all([
      fetchSeries(SERIES.wti, range.points),
      fetchSeries(SERIES.brent, range.points),
      fetchLivePrices().catch((error) => {
        console.warn("Live quote fetch failed, falling back to EIA historical close.", error);
        return null;
      }),
    ]);

    response.json({
      updatedAt: new Date().toISOString(),
      source: "U.S. Energy Information Administration",
      latestSource: livePrices ? "Oil Price API" : "U.S. Energy Information Administration",
      range: {
        key: rangeKey,
        label: range.label,
        chartPoints: range.chartPoints,
      },
      latest: livePrices,
      series: {
        wti,
        brent,
      },
    });
  } catch (error) {
    console.error(error);
    response.status(502).json({
      error: error instanceof Error ? error.message : "Failed to load oil prices.",
    });
  }
});

app.listen(port, () => {
  console.log(`Oil price backend listening on http://localhost:${port}`);
});

async function fetchSeries(seriesId, points) {
  const params = new URLSearchParams();
  params.set("api_key", eiaApiKey);
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "desc");
  params.set("length", String(points));

  const response = await fetch(
    `https://api.eia.gov/v2/seriesid/${encodeURIComponent(seriesId)}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`EIA request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const rows = payload?.response?.data;

  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error(`EIA returned insufficient data for ${seriesId}.`);
  }

  return rows
    .map((entry) => ({
      date: entry.period,
      value: Number(entry.value),
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

async function fetchLivePrices() {
  if (!oilPriceApiToken) {
    return null;
  }

  const response = await fetch("https://api.oilpriceapi.com/v1/prices/latest", {
    headers: {
      Authorization: `Token ${oilPriceApiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Oil Price API request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const wti = payload?.data?.WTI;
  const brent = payload?.data?.BRENT;

  if (!wti || !brent) {
    throw new Error("Oil Price API returned incomplete latest price data.");
  }

  return {
    wti: {
      price: Number(wti.price),
      change: typeof wti.change === "string" ? wti.change : null,
      timestamp: wti.timestamp,
    },
    brent: {
      price: Number(brent.price),
      change: typeof brent.change === "string" ? brent.change : null,
      timestamp: brent.timestamp,
    },
  };
}
