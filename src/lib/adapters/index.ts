import { NormalizedShowPlan, ShowPlanSanityReport } from "@/types/showPlan";
import { SkybrushAdapter } from "./skybrush";
import { VimdronesAdapter } from "./vimdrones";
import { VergeAeroAdapter } from "./vergeAero";

export type AdapterSource = "auto" | "skybrush" | "vimdrones" | "verge_aero";

export class ShowPlanImporter {
  private static activePlan: NormalizedShowPlan | null = null;

  public static getActivePlan(): NormalizedShowPlan | null {
    return this.activePlan;
  }

  public static setActivePlan(plan: NormalizedShowPlan): void {
    this.activePlan = plan;
  }

  /**
   * Detects and parses any show file into a uniform NormalizedShowPlan.
   */
  public static parseShow(
    content: string | Record<string, unknown>,
    sourceHint: AdapterSource = "auto",
    showId?: string
  ): { plan: NormalizedShowPlan; sanity: ShowPlanSanityReport } {
    let resolvedSource: "skybrush" | "vimdrones" | "verge_aero" = "skybrush";

    if (sourceHint !== "auto") {
      resolvedSource = sourceHint;
    } else {
      // Auto-detection logic
      let textContent = typeof content === "string" ? content : JSON.stringify(content);
      textContent = textContent.toLowerCase();

      if (textContent.includes("vimdrones") || textContent.includes("keyframes")) {
        resolvedSource = "vimdrones";
      } else if (
        textContent.includes("verge_aero") ||
        textContent.includes("verge aero") ||
        textContent.includes("vergeaero")
      ) {
        resolvedSource = "verge_aero";
      } else {
        resolvedSource = "skybrush";
      }
    }

    let plan: NormalizedShowPlan;
    const finalShowId = showId || `show-${Date.now()}`;

    switch (resolvedSource) {
      case "skybrush":
        plan = SkybrushAdapter.parse(content, finalShowId);
        break;
      case "vimdrones":
        plan = VimdronesAdapter.parse(content, finalShowId);
        break;
      case "verge_aero":
        plan = VergeAeroAdapter.parse(content, finalShowId);
        break;
      default:
        throw new Error(`Unsupported show source: ${resolvedSource}`);
    }

    const sanity = SkybrushAdapter.evaluateSanity(plan);
    this.setActivePlan(plan);

    return { plan, sanity };
  }
}

export { SkybrushAdapter, VimdronesAdapter, VergeAeroAdapter };
