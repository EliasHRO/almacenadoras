CREATE TABLE IF NOT EXISTS registros (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  actualizado TEXT,
  modificado_por TEXT
);

CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
