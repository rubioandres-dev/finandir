'use client'

import { Eye, EyeOff } from 'lucide-react'
import { usePrivacidad, useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'

/**
 * Con qué estado arranca la app: importes a la vista o tapados.
 *
 * QUÉ SE GUARDA ACÁ Y QUÉ NO
 *
 * Esto es la PREFERENCIA, no el estado actual. El ojito del header tapa y
 * destapa por esta sesión y no toca este interruptor: alguien que ocultó los
 * importes por defecto puede destaparlos un rato para cargar un gasto sin que
 * eso cambie con qué se abre la app la próxima vez.
 *
 * Al revés sí manda: elegir acá aplica el cambio en el acto y borra lo que el
 * ojito hubiera dicho, porque un interruptor que no hace nada visible parece
 * roto.
 *
 * GUARDA AL TOQUE, sin la barra de confirmación de Región/Idioma/Módulos: es
 * una preferencia de este dispositivo —vive en una cookie, no en el perfil— y
 * no reconstruye nada que valga la pena agrupar.
 */
export function PrivacySettings() {
  const { t } = useTraduccion()
  const { ocultoPorDefecto, fijarPorDefecto, cambiando } = usePrivacidad()

  const Icono = ocultoPorDefecto ? EyeOff : Eye

  return (
    <Card id="privacidad" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <CardLabel>
          <Icono className="size-3.5 text-gold-leaf" aria-hidden />
          {t('privacidad.titulo')}
        </CardLabel>

        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-on-background">
              {t('privacidad.ocultarPorDefecto')}
            </span>
            <span className="text-[11px] leading-snug text-subtle">
              {t('privacidad.ocultarPorDefectoDetalle')}
            </span>
          </div>

          {/* Mismo switch que Módulos: `role="switch"` sobre un botón es lo
              que anuncia el estado a un lector de pantalla sin JS extra. */}
          <button
            type="button"
            role="switch"
            aria-checked={ocultoPorDefecto}
            aria-label={t('privacidad.ocultarPorDefecto')}
            onClick={() => fijarPorDefecto(!ocultoPorDefecto)}
            disabled={cambiando}
            className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition disabled:opacity-50 ${
              ocultoPorDefecto ? 'bg-gold-leaf' : 'bg-foreground/15'
            }`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-menu shadow transition-all ${
                ocultoPorDefecto ? 'left-[1.375rem]' : 'left-0.5'
              }`}
              aria-hidden
            />
          </button>
        </div>

        <p className="text-[11px] leading-snug text-subtle">{t('privacidad.ayuda')}</p>
      </CardContent>
    </Card>
  )
}
