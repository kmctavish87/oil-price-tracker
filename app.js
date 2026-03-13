const API_BASE_URL = "https://oil-price-tracker-api.onrender.com";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const RANGE_OPTIONS = {
  "1d": { label: "1 reported day", chartPoints: 1 },
  "5d": { label: "5 reported days", chartPoints: 5 },
  "30d": { label: "30 reported days", chartPoints: 30 },
  "90d": { label: "90 reported days", chartPoints: 90 },
  "1y": { label: "1 year", chartPoints: 365 },
  "5y": { label: "5 years", chartPoints: 1825 },
  "10y": { label: "10 years", chartPoints: 3650 },
};
const SERIES = {
  wti: {
    label: "WTI",
    color: "#b14d24",
  },
  brent: {
    label: "Brent",
    color: "#1e5961",
  },
};

const elements = {
  refreshButton: document.querySelector("#refresh-data"),
  chartTitle: document.querySelector("#chart-title"),
  status: document.querySelector("#status"),
  rangeButtons: Array.from(document.querySelectorAll(".range-button")),
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
let activeRange = "30d";

initialize();

function initialize() {
  setActiveRange(activeRange);
  void loadDashboard(API_BASE_URL, activeRange);

  elements.refreshButton.addEventListener("click", async () => {
    await loadDashboard(API_BASE_URL, activeRange);
  });

  elements.rangeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const rangeKey = button.dataset.range;

      if (!rangeKey || rangeKey === activeRange) {
        return;
      }

      activeRange = rangeKey;
      setActiveRange(activeRange);
      await loadDashboard(API_BASE_URL, activeRange);
    });
  });
}

async function loadDashboard(apiKey, rangeKey) {
  toggleLoading(true);
  setStatus("Loading latest prices from your backend...", "default");

  try {
    const payload = await fetchOilData(apiKey, rangeKey);
    const { wti, brent } = payload;

    updateMetric("wti", wti);
    updateMetric("brent", brent);
    updateChart({ wti, brent }, payload.range);
    updateChartTitle(payload.range?.key || rangeKey);
    setStatus(`Last updated ${new Date().toLocaleString()}.`, "success");
    scheduleAutoRefresh(apiKey);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to load data from EIA.", "error");
  } finally {
    toggleLoading(false);
  }
}

async function fetchOilData(apiBaseUrl, rangeKey) {
  const endpoint = `${apiBaseUrl}/api/oil?range=${encodeURIComponent(rangeKey)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Backend request failed with status ${response.status}. Check your backend URL and deployment.`
    );
  }

  const payload = await response.json();
  const wti = payload?.series?.wti;
  const brent = payload?.series?.brent;

  if (!Array.isArray(wti) || !Array.isArray(brent) || wti.length < 2 || brent.length < 2) {
    throw new Error("Backend returned insufficient oil price data.");
  }

  return { wti, brent, range: payload?.range };
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

function updateChart(seriesData, range) {
  const chartPoints = range?.chartPoints || RANGE_OPTIONS[activeRange]?.chartPoints || 30;
  const wtiRows = seriesData.wti.slice(-chartPoints);
  const brentRows = seriesData.brent.slice(-chartPoints);
  const labels = wtiRows.map((row) => formatDate(row.date, true));

  const datasets = Object.entries({ wti: wtiRows, brent: brentRows }).map(([key, rows]) => ({
    label: SERIES[key].label,
    data: rows.map((row) => row.value),
    borderColor: SERIES[key].color,
    backgroundColor: `${SERIES[key].color}22`,
    borderWidth: 3,
    pointRadius: rows.length === 1 ? 4 : 0,
    pointHoverRadius: 5,
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
  elements.rangeButtons.forEach((button) => {
    button.disabled = isLoading;
  });
}

function scheduleAutoRefresh(apiKey) {
  stopAutoRefresh();
  refreshTimer = window.setInterval(() => {
    void loadDashboard(apiKey, activeRange);
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

function setActiveRange(rangeKey) {
  elements.rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === rangeKey);
  });
  updateChartTitle(rangeKey);
}

function updateChartTitle(rangeKey) {
  const label = RANGE_OPTIONS[rangeKey]?.label || "30 reported days";
  elements.chartTitle.textContent = `Last ${label}`;
}
