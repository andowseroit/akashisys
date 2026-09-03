import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function colomboDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    generateReport();
  }, [period]);

  async function generateReport() {
    setIsLoading(true);
    try {
      const today = colomboDate();
      let startDate: string;
      if (period === "daily") startDate = today;
      else if (period === "weekly") startDate = colomboDate(-6);
      else {
        const [y, m] = today.split("-").map(Number);
        startDate = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      }

      const { data: days, error } = await supabase
        .from("daily_analytics")
        .select("day,revenue,collected,expenses,return_loss,net_deposit")
        .gte("day", startDate)
        .lte("day", today)
        .order("day", { ascending: true });
      if (error) throw error;

      const rows = days || [];
      const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
      const totalCollected = rows.reduce((sum, row) => sum + Number(row.collected || 0), 0);
      const totalExpenses = rows.reduce((sum, row) => sum + Number(row.expenses || 0), 0);
      const totalLosses = rows.reduce((sum, row) => sum + Number(row.return_loss || 0), 0);
      const netDeposit = rows.reduce((sum, row) => sum + Number(row.net_deposit || 0), 0);
      setReportData({ totalRevenue, totalCollected, totalExpenses, totalLosses, netDeposit });
    } catch (err) {
      console.error("Failed to generate report:", err);
      setReportData(null);
      alert("Error generating report");
    } finally {
      setIsLoading(false);
    }
  }

  function downloadPDF() {
    if (!reportData) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Flour Distribution Report", 14, 22);
    doc.setFontSize(11);
    doc.text(`Period: ${period.toUpperCase()} | Generated: ${new Date().toLocaleString()}`, 14, 30);

    autoTable(doc, {
      startY: 40,
      head: [["Metric", "Amount (LKR)"]],
      body: [
        ["Total Revenue", reportData.totalRevenue.toFixed(2)],
        ["Total Collected", reportData.totalCollected.toFixed(2)],
        ["Total Expenses", reportData.totalExpenses.toFixed(2)],
        ["Total Returns/Losses", reportData.totalLosses.toFixed(2)],
        ["Net Deposit", reportData.netDeposit.toFixed(2)],
      ],
    });

    doc.save(`flour-report-${period}-${new Date().toISOString().split("T")[0]}.pdf`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <button
            onClick={downloadPDF}
            disabled={!reportData}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            Download PDF
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="flex gap-2 mb-6">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize border ${
                period === p
                  ? "bg-black text-white border-black"
                  : "bg-white border-gray-300 hover:border-gray-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : reportData ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Total Revenue", value: reportData.totalRevenue, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Collected", value: reportData.totalCollected, color: "text-green-600", bg: "bg-green-50" },
                { label: "Expenses", value: reportData.totalExpenses, color: "text-orange-600", bg: "bg-orange-50" },
                { label: "Returns/Losses", value: reportData.totalLosses, color: "text-red-600", bg: "bg-red-50" },
                { label: "Net Deposit", value: reportData.netDeposit, color: "text-purple-600", bg: "bg-purple-50" },
              ].map((item) => (
                <div key={item.label} className={`rounded-lg border p-6 ${item.bg}`}>
                  <p className="text-sm text-gray-600 mb-2">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.color}`}>
                    LKR {item.value.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
