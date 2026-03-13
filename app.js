const STORAGE_KEY = "oil-tracker-api-base-url";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
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
  apiForm: document.querySelector("#backend-form"),
  apiKeyInput: document.querySelector("#api-base-url"),
  clearKeyButton: document.querySelector("#clear-api-url"),
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
    const apiKey = normalizeBaseUrl(elements.apiKeyInput.value);

    if (!apiKey) {
      setStatus("Enter a valid backend URL.", "error");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, apiKey);
    elements.apiKeyInput.value = apiKey;
    await loadDashboard(apiKey);
  });

  elements.clearKeyButton.addEventListener("click", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    elements.apiKeyInput.value = "";
    clearDashboard();
    setStatus("Backend URL removed. Enter a URL to start.", "default");
    stopAutoRefresh();
  });

  elements.refreshButton.addEventListener("click", async () => {
    const apiKey = normalizeBaseUrl(elements.apiKeyInput.value);

    if (!apiKey) {
      setStatus("Add a backend URL before refreshing.", "error");
      return;
    }

    await loadDashboard(apiKey);
  });
}

async function loadDashboard(apiKey) {
  toggleLoading(true);
  setStatus("Loading latest prices from your backend...", "default");

  try {
    const { wti, brent } = await fetchOilData(apiKey);

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

async function fetchOilData(apiBaseUrl) {
  const endpoint = `${apiBaseUrl}/api/oil`;
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

  return { wti, brent };
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

function normalizeBaseUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (_error) {
    return "";
  }
}
