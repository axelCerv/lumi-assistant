/**
 * Ventana oculta: calcula embeddings con un modelo pequeño y multilingüe
 * (multilingual-e5-small, 384 dimensiones). Se descarga la primera vez y queda en caché.
 */
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL = "Xenova/multilingual-e5-small";
const lumi = window.lumi;

let extractor: Promise<FeatureExtractionPipeline> | null = null;
let queue: Promise<void> = Promise.resolve();

async function start() {
  const snap = await lumi.getSnapshot();
  if (!snap.settings.ai.semanticSearch) return;
  env.allowLocalModels = false;
  void lumi.brainStatus("cargando", "Descargando el modelo de búsqueda (solo la primera vez)…");
  extractor = pipeline("feature-extraction", MODEL, { dtype: "q8", device: "wasm" }) as Promise<FeatureExtractionPipeline>;
  try {
    await extractor;
    void lumi.brainStatus("lista");
  } catch (e) {
    extractor = null;
    const msg = e instanceof Error ? e.message : String(e);
    void lumi.brainStatus(
      "error",
      /fetch|network|ENOTFOUND|Failed/i.test(msg)
        ? "No pude descargar el modelo (se necesita internet la primera vez). Usa «Volver a indexar» para reintentar."
        : msg,
    );
  }
}

lumi.on("brain-task", ({ id, texts }) => {
  // Una tarea a la vez para no saturar la computadora
  queue = queue.then(async () => {
    try {
      if (!extractor) throw new Error("El modelo de búsqueda no está cargado");
      const model = await extractor;
      const out = await model(texts, { pooling: "mean", normalize: true });
      await lumi.brainResult(id, out.tolist() as number[][], null);
    } catch (e) {
      await lumi.brainResult(id, null, e instanceof Error ? e.message : String(e));
    }
  });
});

void start();
