import { describe, expect, it } from "vitest";
import { formatFcfa } from "./format";

describe("formatFcfa", () => {
  it("sépare les milliers", () => {
    expect(formatFcfa(8500)).toBe("8 500 FCFA");
    expect(formatFcfa(1000000)).toBe("1 000 000 FCFA");
  });

  it("n'utilise que des espaces ordinaires", () => {
    // fr-FR sépare les milliers par une espace fine insécable, que la fonction remplace :
    // sans cela une comparaison ou une recherche de chaîne échoue sans rien signaler.
    expect(formatFcfa(27500)).not.toMatch(/[\u202f\u00a0]/);
    expect(formatFcfa(27500)).toBe("27 500 FCFA");
  });

  it("arrondit les décimales", () => {
    expect(formatFcfa(8500.4)).toBe("8 500 FCFA");
    expect(formatFcfa(8500.6)).toBe("8 501 FCFA");
  });

  it("gère zéro et les petits montants", () => {
    expect(formatFcfa(0)).toBe("0 FCFA");
    expect(formatFcfa(500)).toBe("500 FCFA");
  });

  it("gère les montants négatifs", () => {
    expect(formatFcfa(-5000)).toBe("-5 000 FCFA");
  });
});
