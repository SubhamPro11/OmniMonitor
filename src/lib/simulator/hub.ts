import { getGlobalSimulator } from "./engine";
import { getGlobalIngestion } from "../ingestion/receiver";
import { getGlobalMonitoringEngine } from "../sync/monitoringEngine";
import { getGlobalAnomalyDetector } from "../anomalies/detector";

let isHubInitialized = false;

export function initializeTelemetryPipeline() {
  if (isHubInitialized) return;
  isHubInitialized = true;

  const simulator = getGlobalSimulator();
  const receiver = getGlobalIngestion();
  const monitoring = getGlobalMonitoringEngine();
  const detector = getGlobalAnomalyDetector();

  // Pipe all simulator emissions directly through the strict validation & monitoring engine
  simulator.onBatch((batch) => {
    receiver.ingestBatch(batch);
    for (const event of batch) {
      const health = monitoring.processTelemetry(event);
      detector.evaluate(health);
    }
  });
}
