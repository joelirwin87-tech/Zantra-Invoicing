import { formatCurrency } from "./utils.js";

export class ChartManager {
  constructor() {
    this.paidMonthlyChart = null;
    this.gstSummaryChart = null;
  }

  updatePaidMonthly(data) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js is unavailable; skipping paid monthly chart render.");
      return;
    }
    const ctx = document.getElementById("paid-monthly-chart");
    const emptyState = document.getElementById("paid-monthly-empty");

    if (!ctx) {
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      emptyState?.classList.remove("hidden");
      ctx.classList.add("hidden");
      this.#destroyChart("paidMonthlyChart");
      return;
    }

    emptyState?.classList.add("hidden");
    ctx.classList.remove("hidden");

    const labels = data.map((entry) => this.#formatMonth(entry.month));
    const values = data.map((entry) => entry.total);

    if (this.paidMonthlyChart) {
      this.paidMonthlyChart.data.labels = labels;
      this.paidMonthlyChart.data.datasets[0].data = values;
      this.paidMonthlyChart.update();
      return;
    }

    this.paidMonthlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Paid Total",
            data: values,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.2)",
            tension: 0.35,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#2563eb"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.parsed.y)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value)
            }
          }
        }
      }
    });
  }

  updateGstSummary(summary) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js is unavailable; skipping GST summary chart render.");
      return;
    }
    const ctx = document.getElementById("gst-summary-chart");
    const emptyState = document.getElementById("gst-summary-empty");
    const breakdown = document.getElementById("gst-breakdown");

    if (!ctx || !breakdown) {
      return;
    }

    const hasData = summary.totalNet > 0 || summary.totalGst > 0;
    if (!hasData) {
      emptyState?.classList.remove("hidden");
      breakdown.innerHTML = "";
      ctx.classList.add("hidden");
      this.#destroyChart("gstSummaryChart");
      return;
    }

    emptyState?.classList.add("hidden");
    ctx.classList.remove("hidden");

    const dataset = [summary.totalPaidGst, summary.totalOutstandingGst];
    const labels = ["GST Collected", "GST Outstanding"];

    if (this.gstSummaryChart) {
      this.gstSummaryChart.data.labels = labels;
      this.gstSummaryChart.data.datasets[0].data = dataset;
      this.gstSummaryChart.update();
    } else {
      this.gstSummaryChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: dataset,
              backgroundColor: ["#16a34a", "#f59e0b"],
              hoverOffset: 8
            }
          ]
        },
        options: {
          plugins: {
            legend: {
              position: "bottom"
            },
            tooltip: {
              callbacks: {
                label: (context) => `${context.label}: ${formatCurrency(context.parsed)}`
              }
            }
          }
        }
      });
    }

    breakdown.innerHTML = this.#renderBreakdown(summary);
  }

  #renderBreakdown(summary) {
    const breakdownItems = [
      { label: "Net Total", value: summary.totalNet },
      { label: "GST Total", value: summary.totalGst },
      { label: "Gross Total", value: summary.grossTotal },
      { label: "Paid (Net)", value: summary.totalPaidNet },
      { label: "Paid GST", value: summary.totalPaidGst },
      { label: "Outstanding (Net)", value: summary.totalOutstandingNet },
      { label: "Outstanding GST", value: summary.totalOutstandingGst }
    ];

    return breakdownItems
      .map(
        (item) => `
        <div>
          <dt>${item.label}</dt>
          <dd>${formatCurrency(item.value)}</dd>
        </div>
      `
      )
      .join("");
  }

  #formatMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    if (!year || !month) {
      return monthKey;
    }

    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short"
    }).format(date);
  }

  #destroyChart(property) {
    const chart = this[property];
    if (chart) {
      chart.destroy();
      this[property] = null;
    }
  }
}
