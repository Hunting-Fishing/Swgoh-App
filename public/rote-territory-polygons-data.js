export const ROTE_TERRITORY_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: "932c5d4d2e7a29b23baa37f759cd1254459a97a2",
  mapFile: "html/main.html",
  thresholdsFile: "js/main.js",
  markerFile: "css/main.css",
  viewBox: Object.freeze([0, 0, 750, 500]),
  note: "Territory geometry and reference TP thresholds are derived from the cited GenSkaar ROTE map revision. Mandalore has a source marker but no territory SVG path in that map revision, so it remains an explicit hotspot rather than a fabricated polygon.",
});

const pathTerritory = (path, thresholds) => Object.freeze({
  kind: "path",
  path,
  thresholds: Object.freeze(thresholds.map((entry) => Object.freeze(entry))),
});

const hotspotTerritory = (cx, cy, r, thresholds) => Object.freeze({
  kind: "hotspot",
  cx,
  cy,
  r,
  thresholds: Object.freeze(thresholds.map((entry) => Object.freeze(entry))),
});

const stars = (one, two, three) => [
  { label: "1★", tp: one },
  { label: "2★", tp: two },
  { label: "3★", tp: three },
];

const bonus = (tierOne, tierTwo, starOne) => [
  { label: "Tier 1", tp: tierOne },
  { label: "Tier 2", tp: tierTwo },
  { label: "1★", tp: starOne },
];

export const ROTE_TERRITORY_SHAPES = Object.freeze({
  mustafar: pathTerritory("M 263 417 L 326 422 C 330 408 332 400 347 388 L 316 337 C 292 350 269 380 263 417 z", stars(116406250, 186250000, 248333333)),
  corellia: pathTerritory("M 346 388 L 316 337 C 327 330 338 327 351 324 L 349 313 C 365 311 381 311 396 314 L 395 325 C 408 327 416 330 429 338 L 398 388 C 384 380 366 378 346 388 z", stars(111718750, 178750000, 238333333)),
  coruscant: pathTerritory("M 419 422 L 482 416 C 478 390 459 351 429 338 L 399 388 C 410 395 418 412 419 422 z", stars(116406250, 186250000, 248333333)),

  geonosis: pathTerritory("M 271 388 L 255 382 L 254 385 L 230 377 L 231 373 L 213 366 C 219 354 226 340 237 328 L 243 332 L 267 309 L 263 302 C 278 289 285 286 304 278 L 308 288 L 311 287 L 322 311 L 319 312 L 327 331 C 299 344 283 365 271 388 z", stars(148125000, 237000000, 316000000)),
  felucia: pathTerritory("M 419 331 L 426 313 L 424 311 L 435 287 L 437 288 L 442 277 C 393 259 351 259 304 277 L 309 288 L 311 287 L 322 311 L 319 312 L 327 331 L 350 323 L 349 313 C 365 310 379 310 396 313 L 395 324 L 419 331 z", stars(148125000, 237000000, 316000000)),
  bracca: pathTerritory("M 475 388 C 462 361 443 343 418 331 L 426 312 L 424 311 L 434 287 L 437 288 L 442 277 C 456 285 468 289 482 303 L 478 309 L 502 332 L 509 328 C 520 341 525 352 533 366 L 515 373 L 516 378 L 492 386 L 490 382 L 475 388 z", stars(142265625, 227625000, 303500000)),

  dathomir: pathTerritory("M 200 280 L 251 324 L 244 332 L 236 327 C 215 357 201 387 196 425 L 152 425 L 161 382 L 141 377 C 156 333 172 311 200 280 z", stars(158960938, 254337500, 339116667)),
  tatooine: pathTerritory("M 415 269 L 427 222 L 438 225 L 441 217 C 391 205 364 205 305 217 L 308 225 L 318 223 L 331 268 C 366 261 387 261 415 269 z", stars(190953125, 305525000, 407366667)),
  kashyyyk: pathTerritory("M 549 425 L 593 425 L 584 382 L 604 377 C 590 337 575 309 545 281 L 494 325 L 502 333 L 509 328 C 533 360 547 391 549 425 z", stars(190953125, 305525000, 407366667)),

  haven: pathTerritory("M 153 346 C 167 320 181 300 200 280 L 206 286 L 229 265 L 225 260 L 253 238 L 225 195 L 213 202 L 209 198 L 185 214 L 188 219 C 172 229 159 241 144 258 L 140 255 C 125 269 114 285 103 304 L 108 307 L 98 325 L 108 330 L 105 338 L 134 348 L 138 340 z", stars(235143105, 400243583, 500304479)),
  kessel: pathTerritory("M 373 164 L 400 165 L 401 159 C 422 160 437 161 456 169 L 459 162 L 485 171 L 483 178 L 521 195 L 493 239 C 450 216 424 208 373 208 L 373 164 z", stars(235143105, 400243583, 500304479)),
  lothal: pathTerritory("M 592 346 C 578 319 569 301 545 281 L 539 286 L 516 265 L 521 260 L 493 239 L 521 195 L 533 203 L 537 198 L 561 214 L 558 219 C 574 232 585 241 601 258 L 606 254 C 619 270 631 284 642 304 L 637 307 L 647 325 L 637 329 L 640 337 L 611 347 L 608 340 L 592 346 z", stars(246742558, 419987333, 524984167)),

  malachor: pathTerritory("M 167 170 L 196 207 L 185 214 L 188 220 C 172 231 158 243 144 259 L 139 256 L 120 280 L 78 254 C 97 231 108 218 126 202 L 117 193 L 146 172 L 154 181 L 167 170 z", stars(341250768, 620455942, 729948167)),
  vandor: pathTerritory("M 291 117 L 305 165 C 320 160 331 159 345 159 L 345 165 L 400 165 L 401 158 C 416 158 426 159 441 164 L 455 118 C 410 106 351 104 291 117 z", stars(341250768, 620455942, 729948167)),
  kafrene: pathTerritory("M 625 279 L 667 254 C 652 235 637 218 619 202 L 627 193 L 599 172 L 591 181 L 578 170 L 549 207 L 561 215 L 557 220 C 573 231 587 243 600 258 L 605 255 L 625 279 z", stars(341250768, 620455942, 729948167)),

  "death-star": pathTerritory("M 218 93 L 228 115 L 202 127 L 212 145 C 187 156 174 164 154 181 L 146 171 L 118 193 L 126 202 L 118 209 L 80 176 L 105 155 L 101 151 C 127 132 141 124 168 109 L 171 114 L 218 93 z", stars(582632425, 1059331682, 1246272567)),
  hoth: pathTerritory("M 507 133 C 513.6667 119.6667 520.3333 106.3333 527 93 C 496 79 463 71 428 68 L 428 62 L 393 59 L 393 65 C 386 64 380 64 372 64 L 372 109 C 423 109 462 118 507 133 z", stars(582632425, 1059331682, 1246272567)),
  scarif: pathTerritory("M 627 209 L 665 176 L 640 155 L 643 151 C 622 135 601 122 577 109 L 574 114 C 559 106 544 99 527 92 L 516 115 L 542 127 L 533 146 C 554 155 573 165 591 181 L 599 171 L 628 193 L 619 202 L 627 209 z", stars(555710999, 1010383635, 1188686629)),

  zeffo: pathTerritory("M 494 324 L 538 285 L 516 265 L 520 260 C 496 239 472 227 441 217 L 439 225 L 427 222 L 415 268 C 442 275 463 284 483 302 L 478 308 L 494 324 z", bonus(143589583, 229743333, 287179167)),
  mandalore: hotspotTerritory(303.75, 188.75, 28, bonus(197748650, 316397840, 396497300)),
});

export const ROTE_SOURCE_MARKERS = Object.freeze({
  "death-star": Object.freeze({ x: 20.5, y: 28.75 }),
  malachor: Object.freeze({ x: 19, y: 41.25 }),
  haven: Object.freeze({ x: 20.5, y: 56.75 }),
  lothal: Object.freeze({ x: 79.5, y: 56.75 }),
  kessel: Object.freeze({ x: 57.5, y: 36.75 }),
  dathomir: Object.freeze({ x: 25.5, y: 67.75 }),
  geonosis: Object.freeze({ x: 36.5, y: 66.75 }),
  tatooine: Object.freeze({ x: 47.5, y: 46.75 }),
  mustafar: Object.freeze({ x: 40.5, y: 76.75 }),
  corellia: Object.freeze({ x: 49.5, y: 69.75 }),
  vandor: Object.freeze({ x: 52.5, y: 25.75 }),
  hoth: Object.freeze({ x: 61.5, y: 18.75 }),
  felucia: Object.freeze({ x: 52.5, y: 56.75 }),
  kashyyyk: Object.freeze({ x: 74.5, y: 66.75 }),
  coruscant: Object.freeze({ x: 58.5, y: 76.75 }),
  bracca: Object.freeze({ x: 62.5, y: 66.75 }),
  kafrene: Object.freeze({ x: 79.5, y: 40.75 }),
  scarif: Object.freeze({ x: 78.5, y: 27.75 }),
  zeffo: Object.freeze({ x: 62.5, y: 50.75 }),
  mandalore: Object.freeze({ x: 40.5, y: 37.75 }),
});

export function roteTerritoryShape(id) {
  return ROTE_TERRITORY_SHAPES[String(id || "")] || null;
}
