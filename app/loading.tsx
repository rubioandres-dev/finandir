import { BrandSplash } from '@/components/brand-splash'

/**
 * Cortina de carga raíz. Se ve al entrar al dashboard tras el login (el
 * layout del dashboard es async y suspende acá) y en cualquier primera carga.
 * Las secciones internas tienen su propio loading.tsx con skeletons, así que
 * esta pantalla completa no aparece al navegar entre pestañas.
 */
export default function CargaRaiz() {
  return <BrandSplash modo="carga" />
}
