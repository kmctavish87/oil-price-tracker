import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const historyPoints = 30;
const eiaApiKey = process.env.EIA_API_KEY;
const corsOrigin = process.env.CORS_ORIGIN || "*";

const SERIES = {
  wti: "PET.RWTC.D",
  brent: "PET.RBRTE.D",
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

app.get("/api/oil", async (_request, response) => {
  if (!eiaApiKey) {
    response.status(500).json({
      error: "Server is missing EIA_API_KEY.",
    });
    return;
  }

  try {
    const [wti, brent] = await Promise.all([
      fetchSeries(SERIES.wti),
      fetchSeries(SERIES.brent),
    ]);

    response.json({
      updatedAt: new Date().toISOString(),
      source: "U.S. Energy Information Administration",
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

async function fetchSeries(seriesId) {
  const params = new URLSearchParams();
  params.set("api_key", eiaApiKey);
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "desc");
  params.set("length", String(historyPoints));

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
