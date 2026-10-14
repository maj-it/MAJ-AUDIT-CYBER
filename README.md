# MAJ Audit

Plateforme GRC d'audit cybersécurité par **MAJ-IT** (Babette Flore Majeu). Elle permet de mener un audit de conformité, de le noter, de produire le plan d'actions et un rapport PDF/Excel, avec un scan externe qui fournit des preuves à valider.

## Fonctionnalités

- **Référentiels** : ANSSI TPE (12 contrôles), ANSSI hygiène (42), ISO 27001 (clauses 4-10 + Annexe A, 118), NIST CSF 2.0 (106), RGPD (58), NIS2 (37)
- **Questionnaire et scoring** par maturité (0 à 3), score global et par domaine, radar
- **Scan externe** (DNS, SPF/DKIM/DMARC, TLS, en-têtes HTTP, ports, fichiers exposés, sous-domaines) avec note A–F
- **Scan → preuves** : les constats du scan deviennent des preuves « constaté par scan » que l'auditeur valide ou rejette ; seules les preuves validées entrent dans le score et les rapports
- **Autres référentiels** : projection indicative des réponses sur ANSSI / ISO 27001 / NIS2 / RGPD / NIST par thème (`src/data/crosswalk.json`, table établie par MAJ-IT, non officielle)
- **Suivi dans le temps** : comparaison de deux audits du même client (score, contrôles corrigés, régressions), plan d'actions avec statuts et échéances
- **Assistant IA** : Ollama/Qwen local en priorité, repli par règles, IA cloud (Anthropic ou Gemini) via proxy serveur avec consentement de la mission. Les suggestions IA doivent être validées avant export
- **Exports** PDF et Excel, sauvegarde/restauration JSON
- **Mode SaaS** optionnel (Supabase, multi-organisations) ou **mode démo** sans base de données

## Stack

React 18, Vite 5, Tailwind 3, Zustand, react-router, recharts, jsPDF, SheetJS. Fonctions serverless Node (`api/`) pour le scan et le proxy IA.

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les variables utiles
npm run dev
```

En développement, deux comptes de démonstration sont proposés sur l'écran de connexion. L'IA locale demande Ollama (`ollama serve`) avec un modèle Qwen installé.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `VITE_DEMO_MODE=true` | Accès démo sans compte ni base (données locales au navigateur, audit d'exemple fictif) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Mode SaaS (voir `supabase/schema.sql`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | IA cloud Anthropic, prioritaire si présente (côté serveur uniquement) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | IA cloud Gemini, utilisée si aucune clé Anthropic |
| `SCAN_TOKEN` | Jeton exigé par `/api/scan` et `/api/ai` hors localhost |
| `VITE_OLLAMA_TIMEOUT_MS` | Délai maximal de l'IA locale (défaut 150000) |

Les variables préfixées `VITE_` sont publiques (visibles dans le navigateur). Les clés d'API ne doivent jamais porter ce préfixe.

## Déploiement sur Vercel

1. Importer le dépôt dans Vercel (framework Vite, détecté automatiquement).
2. Renseigner les variables ci-dessus dans Settings → Environment Variables. Pour une démo : `VITE_DEMO_MODE=true`, `ANTHROPIC_API_KEY`, `SCAN_TOKEN`.
3. Pour le mode SaaS : créer un projet Supabase, exécuter `supabase/schema.sql` dans le SQL Editor, puis renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

## Sécurité

- Ne jamais committer `.env`. Les clés restent côté serveur.
- Les comptes de démonstration n'existent qu'en développement.
- Le scan exige une attestation d'autorisation écrite du propriétaire du domaine et protège contre les requêtes vers des adresses internes (SSRF). N'auditer et ne scanner que des systèmes pour lesquels une autorisation écrite a été obtenue.
- Les données envoyées à l'IA cloud sont anonymisées côté client puis côté serveur, uniquement si la mission l'autorise.

## Limites connues

- Les titres ANSSI, la structuration NIS2 et RGPD et la table de correspondance entre référentiels sont des travaux de MAJ-IT, non officiels : à vérifier avant usage contractuel.
- En mode démo, les données restent dans le navigateur de chaque utilisateur.
