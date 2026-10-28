# Ütemezők kísérleti összevetése – összefoglaló

Elsődleges végpont: a felhasználónkénti log-veszteség különbsége, **FSRS-4.5 (személyre illesztve) − SM-2** (negatív = az FSRS a jobb).

| Forgatókönyv | felh. | teszt minta | átl. különbség [95% CI] | „FSRS” jobb | p (Holm) | AUC: FSRS szem. / SM-2 | ECE: FSRS szem. / SM-2 |
|---|---:|---:|---|---:|---:|---|---|
| [szimuláció, ACT-R (hatványfüggvény, térközhatás)](actr/README.md) | 40 | 10064 | -0,0374 [-0,0511; -0,0248] | 80% | < 0,001 | 0,576 / 0,484 | 0,036 / 0,105 |
| [szimuláció, HLR (exponenciális felejtés)](hlr/README.md) | 40 | 11956 | -0,0173 [-0,0320; -0,0045] | 48% | 0,337 | 0,713 / 0,558 | 0,068 / 0,023 |
| [szimuláció, FSRS-4.5 (perturbált súlyok)](fsrs/README.md) | 40 | 12042 | -0,0366 [-0,0434; -0,0296] | 95% | < 0,001 | 0,694 / 0,568 | 0,011 / 0,045 |

Előállítva: `npm run experiment:schedulers --`
