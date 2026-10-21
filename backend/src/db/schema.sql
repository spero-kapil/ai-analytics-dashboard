CREATE TABLE IF NOT EXISTS Providers (
  id           CHAR(36)     NOT NULL,
  provider     VARCHAR(50)  NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  data         JSON         NOT NULL,
  plan_type    VARCHAR(50)  NOT NULL,
  createdAt    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_account (provider, account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
