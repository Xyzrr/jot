import { registerOTel } from "@vercel/otel";
import { BraintrustExporter } from "@braintrust/otel";

const projectName = process.env.BRAINTRUST_PROJECT_NAME || "jot";

export function initTelemetry() {
  if (!process.env.BRAINTRUST_API_KEY) {
    console.log("⚠ BRAINTRUST_API_KEY not set, skipping telemetry");
    return;
  }

  registerOTel({
    serviceName: "jot-server",
    traceExporter: new BraintrustExporter({
      parent: `project_name:${projectName}`,
      filterAISpans: true, // Only send AI-related spans
    }),
  });

  console.log(`✓ Braintrust telemetry initialized (project: ${projectName})`);
}
