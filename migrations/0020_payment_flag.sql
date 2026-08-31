-- A payment's resolution is a human decision, not arithmetic. NULL means
-- nobody has said anything (the ledger shows a dash, never an automatic
-- "Unpaid"); 'late' is a mark the performer sets on money they are
-- chasing; 'done' closes the row whatever the amounts say — under, over
-- or exact, they are not looking into it anymore.
ALTER TABLE work_records ADD COLUMN paymentFlag TEXT
  CHECK (paymentFlag IN ('late', 'done'));
