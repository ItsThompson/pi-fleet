import { useSSE } from "@/hooks/useSSE";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainArea } from "@/components/layout/MainArea";

export function App() {
  const connectionState = useSSE();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header connectionState={connectionState} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <MainArea />
        </main>
      </div>
    </div>
  );
}
