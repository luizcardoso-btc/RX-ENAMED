-- Ficha completa do cadastro: sexo e em que etapa da formação o aluno está (o celular usa a coluna telefone).
ALTER TABLE usuarios
  ADD COLUMN sexo text CHECK (sexo IN ('masculino', 'feminino')),
  ADD COLUMN etapa text CHECK (etapa IN ('1', '2', '3', '4', '5', '6', 'formado', 'exterior'));
