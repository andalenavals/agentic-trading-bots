import { Dashboard } from "@/components/dashboard/Dashboard";
import { loadDashboardData } from "@/lib/data/loaders";

export default async function Home() {
  const data = await loadDashboardData();
  return <Dashboard data={data} />;
}

