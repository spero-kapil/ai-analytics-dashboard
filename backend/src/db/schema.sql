CREATE TABLE IF NOT EXISTS providers (
  id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  provider      VARCHAR(50)  NOT NULL,
  email_id      VARCHAR(254) NOT NULL,
  account_name  VARCHAR(255),
  data          JSONB        NOT NULL,
  plan_type     VARCHAR(50)  NOT NULL,
  miscellaneous JSONB,
  is_active     SMALLINT     NOT NULL DEFAULT 1,
  last_updated  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT providers_pkey PRIMARY KEY (id),
  CONSTRAINT uq_provider_email UNIQUE (provider, email_id),
  CONSTRAINT chk_is_active CHECK (is_active IN (0, 1))
);
