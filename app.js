const STORAGE_KEY = "oil-tracker-eia-api-key";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const HISTORY_POINTS = 30;
const SERIES = {
  wti: {
    id: "PET.RWTC.D",
    label: "WTI",
    color: "#b14d24",
  },
  brent: {
    id: "PET.RBRTE.D",
    label: "Brent",
    color: "#1e5961",
  },
};

const elements = {
  apiForm: document.querySelector("#api-form"),
  apiKeyInput: document.querySelector("#api-key"),
  clearKeyButton: document.querySelector("#clear-key"),
  refreshButton: document.querySelector("#refresh-data"),
  status: document.querySelector("#status"),
  prices: {
    wti: {
      price: document.querySelector("#wti-price"),
      delta: document.querySelector("#wti-delta"),
      date: document.querySelector("#wti-date"),
    },
    brent: {
      price: document.querySelector("#brent-price"),
      delta: document.querySelector("#brent-delta"),
      date: document.querySelector("#brent-date"),
    },
  },
  chartCanvas: document.querySelector("#price-chart"),
};

let chart;
let refreshTimer;

initialize();

function initialize() {
  const savedKey = window.localStorage.getItem(STORAGE_KEY);

  if (savedKey) {
    elements.apiKeyInput.value = savedKey;
    void loadDashboard(savedKey);
  }

  elements.apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const apiKey = elements.apiKeyInput.value.trim();

    if (!apiKey) {
      setStatus("Enter a valid EIA API key.", "error");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, apiKey);
    await loadDashboard(apiKey);
  });

  elements.clearKeyButton.addEventListener("click", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    elements.apiKeyInput.value = "";
    clearDashboard();
    setStatus("API key removed. Enter a key to start.", "default");
    stopAutoRefresh();
  });

  elements.refreshButton.addEventListener("click", async () => {
    const apiKey = elements.apiKeyInput.value.trim();

    if (!apiKey) {
      setStatus("Add an API key before refreshing.", "error");
      return;
    }

    await loadDashboard(apiKey);
  });
}

async function loadDashboard(apiKey) {
  toggleLoading(true);
  setStatus("Loading latest prices from EIA...", "default");

  try {
    const [wti, brent] = await Promise.all([
      fetchSeries(SERIES.wti.id, apiKey),
      fetchSeries(SERIES.brent.id, apiKey),
    ]);

    updateMetric("wti", wti);
    updateMetric("brent", brent);
    updateChart({ wti, brent });
    setStatus(`Last updated ${new Date().toLocaleString()}.`, "success");
    scheduleAutoRefresh(apiKey);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to load data from EIA.", "error");
  } finally {
    toggleLoading(false);
  }
}

async function fetchSeries(seriesId, apiKey) {
  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "desc");
  params.set("length", String(HISTORY_POINTS));

  const endpoint = `https://api.eia.gov/v2/seriesid/${encodeURIComponent(seriesId)}?${params.toString()}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`EIA request failed with status ${response.status}. Check your API key.`);
  }

  const payload = await response.json();
  const rawSeries = payload?.response?.data;

  if (!Array.isArray(rawSeries) || rawSeries.length < 2) {
    throw new Error(`EIA returned insufficient data for ${seriesId}.`);
  }

  const rows = rawSeries
    .map((entry) => ({
      date: entry.period,
      value: Number(entry.value),
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => new Date(left.date) - new Date(right.date));

  return rows;
}

function updateMetric(key, rows) {
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const deltaValue = latest.value - previous.value;
  const deltaPercent = previous.value === 0 ? 0 : (deltaValue / previous.value) * 100;
  const directionClass = deltaValue >= 0 ? "is-up" : "is-down";
  const sign = deltaValue >= 0 ? "+" : "";

  elements.prices[key].price.textContent = formatCurrency(latest.value);
  elements.prices[key].delta.textContent =
    `${sign}${deltaValue.toFixed(2)} (${sign}${deltaPercent.toFixed(2)}%) vs prior close`;
  elements.prices[key].delta.className = `delta ${directionClass}`;
  elements.prices[key].date.textContent = `Reported ${formatDate(latest.date)}`;
}

function updateChart(seriesData) {
  const labels = seriesData.wti.map((row) => formatDate(row.date, true));

  const datasets = Object.entries(seriesData).map(([key, rows]) => ({
    label: SERIES[key].label,
    data: rows.map((row) => row.value),
    borderColor: SERIES[key].color,
    backgroundColor: `${SERIES[key].color}22`,
    borderWidth: 3,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.3,
    fill: false,
  }));

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
    return;
  }

  chart = new window.Chart(elements.chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            maxRotation: 0,
            color: "#6a5f56",
          },
        },
        y: {
          ticks: {
            callback(value) {
              return formatCurrency(value);
            },
            color: "#6a5f56",
          },
          grid: {
            color: "rgba(23, 20, 17, 0.08)",
          },
        },
      },
    },
  });
}

function clearDashboard() {
  Object.values(elements.prices).forEach((metric) => {
    metric.price.textContent = "--";
    metric.delta.textContent = "Waiting for data";
    metric.delta.className = "delta";
    metric.date.textContent = "--";
  });

  if (chart) {
    chart.destroy();
    chart = undefined;
  }
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.className = "status";

  if (tone === "error") {
    elements.status.classList.add("is-error");
  }

  if (tone === "success") {
    elements.status.classList.add("is-success");
  }
}

function toggleLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.clearKeyButton.disabled = isLoading;
  elements.apiForm.querySelector("button[type='submit']").disabled = isLoading;
}

function scheduleAutoRefresh(apiKey) {
  stopAutoRefresh();
  refreshTimer = window.setInterval(() => {
    void loadDashboard(apiKey);
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value, compact = false) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: compact ? "short" : "long",
    day: "numeric",
    year: compact ? undefined : "numeric",
  }).format(date);
}
