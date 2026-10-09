import anssiTpe from './anssi-tpe.json'
import anssi from './anssi-hygiene.json'
import iso27001 from './iso27001.json'
import nist from './nist.json'
import rgpd from './rgpd.json'
import nis2 from './nis2.json'

// Clé = referential.id (utilisé dans audit.referentialId)
export const REFERENTIALS = {
  'anssi-tpe': anssiTpe,
  anssi,
  iso27001,
  nist,
  rgpd,
  nis2
}

export const countControls = (r) => r.domains.reduce((acc, d) => acc + d.controls.length, 0)
