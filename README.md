# MAJ Audit

Plateforme GRC d'audit cybersécurité par **MAJ-IT** (Babette Flore Majeu).

- Référentiels : ANSSI TPE (12), ANSSI (42), ISO 27001 (clauses 4-10 + Annexe A, 118), NIST CSF 2.0 (106), RGPD (58), NIS2 (37)
- Scoring par maturité, plan d'actions, rapports PDF / Excel, sauvegarde JSON
- Scan externe (ports, en-têtes, TLS, DNS, sous-domaines) avec note A–F
- Assistant IA : Ollama/Qwen local en priorité, repli par règles, Gemini via proxy serveur (consentement requis). Les suggestions IA doivent être validées avant export.
- Scan → questionnaire : les constats du scan deviennent des preuves « constaté par scan », à valider par l'auditeur avant d'entrer dans le score et les rapports
- Autres référentiels : projection indicative des réponses sur ANSSI / ISO 27001 / NIS2 / RGPD / NIST par thème (table `src/data/crosswalk.json`, établie par MAJ-IT, à faire valider)
- Suivi dans le temps : comparaison de deux audits du même client, contrôles corrigés, plan d'actions avec statuts et échéances
- Mode SaaS optionnel (Supabase)

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les variables nécessaires
npm run dev
```

## Sécurité

- Ne jamais committer `.env`. Les clés (`GEMINI_API_KEY`, `SCAN_TOKEN`) restent côté serveur, sans préfixe `VITE_`.
- Les comptes de démo n'existent qu'en mode développement.
- N'auditer et ne scanner que des systèmes pour lesquels une autorisation écrite a été obtenue.
