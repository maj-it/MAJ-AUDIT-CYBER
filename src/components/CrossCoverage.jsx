import { crosswalkView, CROSSWALK_NOTE, FRAMEWORKS } from '../lib/crosswalk.js'
import { getScoreColor } from '../lib/scoring.js'

export default function CrossCoverage({ referentialId, responses }) {
  const v = crosswalkView(referentialId, responses)
  const others = v.frameworks
  return (
    <div className="space-y-4">
      <div className="text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300">
        Estimation indicative : vos réponses sont projetées sur les autres référentiels par thème. {CROSSWALK_NOTE}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {others.map(f => (
          <div key={f.key} className={`card-sm text-center ${f.key === v.source ? 'border border-cyber-500/40' : ''}`}>
            <div className="text-xs text-slate-400">{f.label}{f.key === v.source ? ' (audité)' : ''}</div>
            <div className="text-2xl font-mono font-bold mt-1" style={{ color: f.estimated === null ? '#64748b' : getScoreColor(f.estimated) }}>
              {f.estimated === null ? '—' : `${f.estimated}%`}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{f.covered}/{f.controls} mesures couvertes par vos réponses</div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-navy-700">
              <th className="py-2 pr-3">Thème</th>
              <th className="py-2 px-2 text-center">Votre score</th>
              {FRAMEWORKS.map(f => <th key={f.key} className="py-2 px-2 text-center">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {v.themes.map(t => (
              <tr key={t.id} className="border-b border-navy-800 align-top">
                <td className="py-2 pr-3 text-slate-300">{t.name}</td>
                <td className="py-2 px-2 text-center font-mono font-bold" style={{ color: t.score === null ? '#64748b' : getScoreColor(t.score) }}>
                  {t.score === null ? 'n/a' : `${t.score}%`}
                </td>
                {FRAMEWORKS.map(f => (
                  <td key={f.key} className="py-2 px-2 text-center text-slate-500 font-mono" title={t.map[f.key].join(', ')}>
                    {t.map[f.key].length ? t.map[f.key].length : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-slate-500 mt-2">Les chiffres indiquent le nombre de mesures de chaque référentiel rattachées au thème (survol : identifiants). « n/a » : thème non évalué par le référentiel audité.</div>
      </div>
    </div>
  )
}
