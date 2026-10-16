import { createContext, useContext } from "react";
import { DEFAULT_AVATAR, hexOf, isLightBody, type AvatarConfig } from "../lib/avatar";

export type Mood = "reposo" | "pendientes" | "hablando" | "reunion" | "pensando" | "arrastrando";

/** El look que usan todos los LumiFace de una ventana (se provee en la raíz). */
export const AvatarLook = createContext<AvatarConfig>(DEFAULT_AVATAR);

interface Props {
  size?: number;
  mood?: Mood;
  shadow?: boolean;
  title?: string;
  /** Para vistas previas: si no se pasa, usa el look guardado. */
  look?: AvatarConfig;
}

const INK = "#1B1D33";
const SHADE = { fill: "#000", fillOpacity: 0.2 } as const;
const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** Media esfera de abajo: la zona donde vive la ropa. */
const LOWER = "M48.2 146 A62 62 0 0 0 151.8 146 Z";
const MUSTACHE = "M90 120 C94 116 99 117 100 120 C101 117 106 116 110 120 C106 123 102 122 100 121 C98 122 94 123 90 120 Z";

/** Lumi: una esferita que flota, con su ropa, cabello y accesorios. */
export function LumiFace({ size = 84, mood = "reposo", shadow = false, title, look }: Props) {
  const ctx = useContext(AvatarLook);
  const a = look ?? ctx;
  const body = hexOf.body(a.cuerpo);
  const light = isLightBody(a.cuerpo);
  const hair = hexOf.hair(a.cabelloColor);
  const cloth = hexOf.color(a.prendaColor);
  const acc = hexOf.color(a.accesorioColor);
  const frame = hexOf.frame(a.lentesColor);
  const feature = light ? INK : "#fff"; // boca y ojos cerrados
  const tilt = mood === "arrastrando" ? "rotate(-8 100 112) translate(0 -6)" : undefined;
  const lookUp = mood === "pendientes" || mood === "pensando";
  const wide = mood === "reunion" || mood === "arrastrando";
  const showBrows = light || a.cabello !== "ninguno";

  const eye = (cx: number) => {
    if (mood === "hablando") {
      return <path key={cx} d={`M${cx - 7} 110 Q${cx} 101 ${cx + 7} 110`} stroke={feature} strokeWidth={4} fill="none" {...round} />;
    }
    const dy = lookUp ? -3 : mood === "arrastrando" ? 3 : 0;
    const dx = lookUp ? 2 : 0;
    if (!light) {
      // estilo clásico: ojo blanco con pupila
      return (
        <g key={cx}>
          <ellipse cx={cx} cy={108} rx={wide ? 7.5 : 7} ry={wide ? 10 : 9} fill="#fff" />
          <circle cx={cx + 1 + dx} cy={109 + dy} r={3.8} fill={INK} />
        </g>
      );
    }
    return (
      <g key={cx}>
        <circle cx={cx + dx} cy={108 + dy} r={wide ? 7.5 : 6} fill={INK} />
        <circle cx={cx + 2 + dx} cy={106 + dy} r={2} fill="#fff" />
      </g>
    );
  };

  let mouth: JSX.Element;
  if (mood === "hablando") mouth = <ellipse cx={100} cy={128} rx={8} ry={6} fill={INK} />;
  else if (mood === "reunion") mouth = <ellipse cx={100} cy={130} rx={4.5} ry={4} fill={feature} />;
  else if (mood === "arrastrando") mouth = <ellipse cx={100} cy={130} rx={5} ry={6.5} fill={INK} />;
  else if (mood === "pensando") mouth = <path d="M93 128h14" stroke={feature} strokeWidth={3.5} fill="none" {...round} />;
  else mouth = <path d="M93 125 Q100 132 107 125" stroke={feature} strokeWidth={3.5} fill="none" {...round} />;

  return (
    <svg width={size} height={size} viewBox="8 16 184 184" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {mood === "reunion" && <circle cx={100} cy={112} r={80} fill="none" stroke="#F4B740" strokeWidth={5} strokeDasharray="9 11" />}
      {shadow && mood !== "reunion" && (
        <ellipse cx={100} cy={192} rx={mood === "arrastrando" ? 28 : 40} ry={mood === "arrastrando" ? 4 : 6} fill="#0B0C1A" opacity={0.22} />
      )}
      <g transform={tilt}>
        {/* detrás: capa */}
        {a.prenda === "capa" && (
          <>
            <path d="M34 108 C24 168 60 194 100 194 C140 194 176 168 166 108 Z" fill={cloth} />
            <path d="M34 108 C24 168 60 194 100 194 C140 194 176 168 166 108 Z" {...SHADE} />
          </>
        )}

        {/* antena (va detrás de la cabeza) */}
        {a.accesorio === "antena" && (
          <>
            <path d="M100 54 C100 40 106 32 116 30" stroke="#8C88EC" strokeWidth={7} fill="none" {...round} />
            <circle cx={119} cy={29} r={8} fill="#F4B740" />
          </>
        )}

        {/* cuerpo */}
        <ellipse cx={40} cy={130} rx={9} ry={12} transform="rotate(-25 40 130)" fill={body} />
        <ellipse cx={160} cy={130} rx={9} ry={12} transform="rotate(25 160 130)" fill={body} />
        <circle cx={100} cy={112} r={62} fill={body} />
        <path d="M58 100 C58 84 66 72 78 64" fill="none" stroke="#fff" strokeOpacity={light ? 0.4 : 0.25} strokeWidth={6} {...round} />

        {/* prenda (solo la parte de abajo) */}
        {a.prenda === "playera" && (
          <>
            <path d={LOWER} fill={cloth} />
            <rect x={106} y={152} width={14} height={10} rx={3} {...SHADE} />
          </>
        )}
        {a.prenda === "bufanda" && (
          <>
            <path d="M50 136 Q100 154 150 136 L152 146 Q100 166 48 146 Z" fill={cloth} />
            <path d="M118 150 L132 150 L128 176 L116 174 Z" fill={cloth} />
            <path d="M118 150 L132 150 L128 176 L116 174 Z" {...SHADE} />
          </>
        )}
        {a.prenda === "overol" && (
          <>
            <path d={LOWER} fill={cloth} />
            <rect x={84} y={134} width={32} height={16} rx={4} fill={cloth} />
            <path d="M86 138 L56 132 M114 138 L144 132" stroke={cloth} strokeWidth={5} {...round} />
            <circle cx={89} cy={140} r={2.5} fill={INK} />
            <circle cx={111} cy={140} r={2.5} fill={INK} />
          </>
        )}
        {a.prenda === "rayas" && (
          <>
            <path d={LOWER} fill={cloth} />
            <path d="M60 156 L140 156 M78 168 L122 168" stroke="#fff" strokeOpacity={0.9} strokeWidth={5} fill="none" {...round} />
          </>
        )}
        {a.prenda === "corbatin" && (
          <>
            <path d="M100 140 L86 132 L86 148 Z M100 140 L114 132 L114 148 Z" fill={cloth} />
            <circle cx={100} cy={140} r={4.5} fill={cloth} />
            <circle cx={100} cy={140} r={4.5} {...SHADE} />
          </>
        )}
        {a.prenda === "capa" && (
          <>
            <path d="M48 132 Q76 142 96 144 M152 132 Q124 142 104 144" fill="none" stroke={cloth} strokeWidth={3.5} {...round} />
            <circle cx={100} cy={144} r={5} fill="#E2A33B" />
          </>
        )}

        {/* cara */}
        {showBrows && (
          <path d="M78 96 Q84 93 90 96 M110 96 Q116 93 122 96" fill="none" stroke={light ? hair : "#fff"} strokeOpacity={light ? 1 : 0.7} strokeWidth={a.base === "masculina" ? 4.5 : 3} {...round} />
        )}
        {eye(84)}
        {eye(116)}
        {a.base === "femenina" && mood !== "hablando" && (
          <path d="M77 103 L73 99 M123 103 L127 99" stroke={light ? INK : "#fff"} strokeWidth={2.2} {...round} />
        )}
        {light ? (
          <>
            <ellipse cx={70} cy={122} rx={8} ry={4} fill="#F28B8B" opacity={mood === "hablando" ? 0.6 : 0.45} />
            <ellipse cx={130} cy={122} rx={8} ry={4} fill="#F28B8B" opacity={mood === "hablando" ? 0.6 : 0.45} />
          </>
        ) : (
          <>
            <circle cx={68} cy={124} r={8} fill="#F4B740" opacity={mood === "hablando" ? 0.75 : 0.55} />
            <circle cx={132} cy={124} r={8} fill="#F4B740" opacity={mood === "hablando" ? 0.75 : 0.55} />
          </>
        )}
        {mouth}

        {/* vello facial */}
        {a.vello === "barba" && (
          <>
            <path d="M80 122 C82 138 92 144 100 144 C108 144 118 138 120 122 C114 132 108 134 100 134 C92 134 86 132 80 122 Z" fill={hair} />
            <path d={MUSTACHE} fill={hair} />
          </>
        )}
        {a.vello === "bigote" && <path d={MUSTACHE} fill={hair} />}

        {/* cabello (arriba de la cima) */}
        {a.cabello === "mechon" && <path d="M100 52 C94 36 102 26 114 30 C106 34 104 42 108 52 Z" fill={hair} />}
        {a.cabello === "fleco" && (
          <path d="M58 70 C66 52 84 46 100 46 C116 46 134 52 142 70 C132 64 124 66 118 72 C112 64 104 64 100 70 C96 64 88 64 82 72 C76 66 68 64 58 70 Z" fill={hair} />
        )}
        {a.cabello === "coletas" && (
          <>
            <circle cx={52} cy={68} r={14} fill={hair} />
            <circle cx={148} cy={68} r={14} fill={hair} />
            <path d="M70 62 C80 52 120 52 130 62 C120 60 110 62 100 66 C90 62 80 60 70 62 Z" fill={hair} />
            <circle cx={61} cy={76} r={4} fill="#E86F5A" />
            <circle cx={139} cy={76} r={4} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "chongo" && (
          <>
            <circle cx={100} cy={40} r={13} fill={hair} />
            <path d="M78 58 C86 48 114 48 122 58 C112 57 106 59 100 63 C94 59 88 57 78 58 Z" fill={hair} />
            <rect x={92} y={50} width={16} height={5} rx={2.5} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "rizos" && (
          <g fill={hair}>
            <circle cx={80} cy={54} r={10} />
            <circle cx={94} cy={48} r={11} />
            <circle cx={108} cy={48} r={11} />
            <circle cx={121} cy={54} r={10} />
            <circle cx={70} cy={64} r={8} />
            <circle cx={131} cy={64} r={8} />
          </g>
        )}
        {a.cabello === "copete" && <path d="M80 56 C78 38 98 30 116 36 C124 40 122 48 114 50 C112 44 104 42 98 46 C94 50 92 54 90 58 Z" fill={hair} />}

        {/* lentes */}
        {a.lentes === "redondos" && (
          <g fill="none" stroke={frame} strokeWidth={2.5} {...round}>
            <circle cx={84} cy={108} r={10.5} />
            <circle cx={116} cy={108} r={10.5} />
            <path d="M94.5 107 Q100 103 105.5 107 M73.5 106 L62 103 M126.5 106 L138 103" />
          </g>
        )}
        {a.lentes === "cuadrados" && (
          <g fill="none" stroke={frame} strokeWidth={3} {...round}>
            <rect x={73} y={99} width={22} height={18} rx={4} />
            <rect x={105} y={99} width={22} height={18} rx={4} />
            <path d="M95 106 L105 106 M73 105 L62 102 M127 105 L138 102" />
          </g>
        )}
        {a.lentes === "gato" && (
          <g fill="none" stroke={frame} strokeWidth={3} {...round}>
            <path d="M72 102 Q84 97 95 102 Q95 117 84 117 Q73 115 72 102 Z" />
            <path d="M128 102 Q116 97 105 102 Q105 117 116 117 Q127 115 128 102 Z" />
            <path d="M95 105 L105 105 M72 102 L62 100 M128 102 L138 100" />
          </g>
        )}
        {a.lentes === "sol" && (
          <>
            <rect x={72} y={100} width={24} height={15} rx={6} fill={INK} stroke={frame} strokeWidth={2.5} />
            <rect x={104} y={100} width={24} height={15} rx={6} fill={INK} stroke={frame} strokeWidth={2.5} />
            <path d="M96 105 L104 105 M72 105 L62 102 M128 105 L138 102" stroke={frame} strokeWidth={2.5} {...round} />
            <path d="M77 105 L83 105 M109 105 L115 105" stroke="#fff" strokeOpacity={0.6} strokeWidth={2} {...round} />
          </>
        )}

        {/* accesorio de cabeza */}
        {a.accesorio === "gorra" && (
          <>
            <path d="M72 60 C72 36 128 36 128 60 Z" fill={acc} />
            <path d="M100 58 C118 54 140 56 144 62 C130 66 112 65 100 62 Z" fill={acc} />
            <path d="M100 58 C118 54 140 56 144 62 C130 66 112 65 100 62 Z" {...SHADE} />
            <circle cx={100} cy={42} r={3} {...SHADE} />
          </>
        )}
        {a.accesorio === "gorro" && (
          <>
            <circle cx={100} cy={32} r={8} fill="#fff" />
            <path d="M70 64 C70 30 130 30 130 64 Z" fill={acc} />
            <rect x={68} y={56} width={64} height={11} rx={5.5} fill={acc} />
            <rect x={68} y={56} width={64} height={11} rx={5.5} {...SHADE} />
          </>
        )}
        {a.accesorio === "audifonos" && (
          <>
            <path d="M44 104 C46 52 154 52 156 104" fill="none" stroke={INK} strokeWidth={6} {...round} />
            <rect x={34} y={94} width={16} height={24} rx={7} fill={acc} />
            <rect x={150} y={94} width={16} height={24} rx={7} fill={acc} />
          </>
        )}
        {a.accesorio === "mono" && (
          <>
            <path d="M128 56 L116 48 L117 64 Z M128 56 L140 48 L139 64 Z" fill={acc} />
            <circle cx={128} cy={56} r={4} fill={acc} />
            <circle cx={128} cy={56} r={4} {...SHADE} />
          </>
        )}
        {a.accesorio === "boina" && (
          <>
            <rect x={95} y={36} width={6} height={8} rx={3} fill={acc} />
            <ellipse cx={98} cy={52} rx={36} ry={11} transform="rotate(-8 98 52)" fill={acc} />
          </>
        )}
      </g>
    </svg>
  );
}
