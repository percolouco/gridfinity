# Gridfinity Layout

Outil web pour planifier une disposition Gridfinity (plan 2D, vue 3D) et exporter en STL la plaque de base et les bacs.
Profil simplifié : pas de lèvre d'empilage ni d'aimants.

- Déploiement : `docker compose up -d --build` → https://gridfinity.nas.percolouco.com
- Code : `geometry.js` (maillages + STL), `app.js` (interface), `vendor/` (three.js 0.160)

Fonctions : liste des bacs (sélection/suppression/édition), sélection dans la vue 3D, compartiments « bento » sur la grille d unités (cloisons posées trait par trait).
