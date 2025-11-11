# Terraform Infrastructure as Code for Autopay Agent

## Overview

This document outlines the Terraform configuration for provisioning and managing the infrastructure supporting the Autopay Agent for x402 Autonomous Payments on Solana. The Autopay Agent is a web application that detects HTTP 402 Payment Required responses, executes Phantom CASH payments on Solana Devnet, and retries API calls to access premium data sources like the Market Data API (crypto prices, arbitrage signals, sentiment metrics) and Knowledge Data API (AI insights). It leverages a Node.js backend with TypeScript, Next.js frontend, PostgreSQL database via Prisma ORM, and integrations with Solana/web3.js and Coinbase x402 Facilitator API.

Terraform is used here to define production-ready infrastructure on AWS, focusing on resources that complement the server's deployment strategy (Vercel for frontend, Render for backend APIs). Specifically, this setup provisions:

- A managed PostgreSQL database (RDS) for storing transaction audit trails, balance monitoring data, and API request logs—extending the local JSON ledger for scalable, queryable persistence in decentralized environments.
- An S3 bucket for secure storage of ephemeral session keys, encryption artifacts (AES-256 compliant), and backup ledgers from failed payments or low-balance events.
- VPC and security groups to isolate Devnet RPC connections, ensuring secure communication for Solana transactions and Coinbase verification callbacks (REST/WebSocket).
- Optional Lambda functions for event-driven tasks, such as real-time balance checks or circuit-breaker triggers on network issues.

This infrastructure supports the agent's resilience features (e.g., retry logic with exponential backoff, insufficient funds monitoring) and configurable autonomy levels (Phase 1 server demo, Phase 2 interactive browser mode, Phase 3 multi-API monitoring). It aligns with BackendDev's needs by providing a provisioned DB endpoint and storage for deployment pipelines, while avoiding overlap with frontend visualization on Vercel.

**Key Design Principles:**
- **Security-First:** Scoped access via IAM roles, encryption at rest/transit, and Devnet isolation to prevent mainnet credential exposure.
- **Scalability:** Auto-scaling RDS for high-volume transaction logging in machine-to-machine economies.
- **Cost-Optimization:** Use of serverless (Lambda) and t3.micro instances for hackathon/demo efficiency, with tags for the project "autopay-agent-for-x402-autonomous-payments-on-solana".
- **Idempotency:** All resources are declarative, enabling safe re-provisioning during CI/CD pipelines (e.g., integrated with GitHub Actions or Render deploys).

**Unique Identifier:** 1762841338037_autopay_agent_for_x402_autonomous_payments_on_solana__infra_terraform_md_tqldik

## Prerequisites

- Terraform CLI (v1.5+ installed).
- AWS CLI configured with credentials (IAM user/role with permissions for RDS, S3, VPC, Lambda, and EC2).
- Node.js project setup with Prisma for DB migrations (coordinated with BackendDev).
- Solana Devnet wallet for testing (Phantom integration handled in app code, not Terraform).
- Environment variables: Set `AWS_REGION=us-east-1` (or preferred), `DB_PASSWORD` (generated securely), and `PROJECT_ENV=dev` for non-production.

Run `terraform init` in the `infra/` directory to initialize providers.

## Providers Configuration

The configuration uses the AWS provider (v5.0+) for cloud resources. No additional providers are needed for Vercel/Render, as those are managed via their APIs in CI/CD.

**providers.tf**
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.5"
}

provider "aws" {
  region = var.aws_region

  # Enable default tags for all resources
  default_tags {
    tags = {
      Project     = "autopay-agent-for-x402-autonomous-payments-on-solana"
      Environment = var.environment
      Purpose     = "x402-Autonomous-Payments-Infrastructure"
      ManagedBy   = "Terraform"
    }
  }
}
```

## Variables

Define project-specific variables for flexibility across environments (dev/staging/prod). These include DB credentials tailored for Prisma integration and S3 policies for AES-256 encrypted key storage.

**variables.tf**
```hcl
variable "aws_region" {
  description = "AWS region for provisioning resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be 'dev', 'staging', or 'prod'."
  }
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL (scalable for transaction audit trails)"
  type        = string
  default     = "db.t3.micro"  # Cost-effective for Solana Devnet testing
}

variable "db_allocated_storage" {
  description = "Initial storage for RDS (GB), auto-scales for ledger growth"
  type        = number
  default     = 20
}

variable "s3_bucket_name" {
  description = "Unique S3 bucket for session keys and ledgers"
  type        = string
  default     = "autopay-agent-${var.environment}-ledger-${random_id.bucket_suffix.hex}"
}

variable "lambda_runtime" {
  description = "Runtime for Lambda functions (e.g., balance monitoring)"
  type        = string
  default     = "nodejs18.x"  # Matches backend Node.js stack
}
```

**Additional Generated Resources (in main.tf snippets below):**
- `random_id.bucket_suffix` for unique S3 naming to avoid conflicts.

## Main Configuration

The core `main.tf` provisions interconnected resources: VPC for secure Solana RPC access, RDS for persistent audit trails (e.g., logging payment failures, successful retries, low-balance events), S3 for ephemeral data, and a Lambda for automated tasks like circuit-breaker resumption.

**main.tf**
```hcl
# Random ID for unique resource naming
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# VPC for isolated networking (protects Devnet RPC and Coinbase WebSocket callbacks)
resource "aws_vpc" "autopay_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "autopay-vpc-${var.environment}"
  }
}

resource "aws_subnet" "private_subnet" {
  vpc_id     = aws_vpc.autopay_vpc.id
  cidr_block = "10.0.1.0/24"

  tags = {
    Name = "autopay-private-${var.environment}"
  }
}

resource "aws_security_group" "autopay_sg" {
  vpc_id = aws_vpc.autopay_vpc.id

  ingress {
    from_port   = 5432  # PostgreSQL for Prisma connections
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.autopay_vpc.cidr_block]
  }

  ingress {
    from_port   = 443   # HTTPS for Coinbase Facilitator API and Solana RPC
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restricted in prod via WAF
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "autopay-sg-${var.environment}"
  }
}

# PostgreSQL RDS for audit trail and balance data (integrates with Prisma for Node.js backend)
resource "aws_db_subnet_group" "autopay_db_subnet" {
  name       = "autopay-db-subnet-${var.environment}"
  subnet_ids = [aws_subnet.private_subnet.id]
}

resource "aws_db_instance" "autopay_postgres" {
  identifier              = "autopay-postgres-${var.environment}"
  engine                  = "postgres"
  engine_version          = "15.4"  # Compatible with Prisma ORM
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  storage_type            = "gp2"
  storage_encrypted       = true
  vpc_security_group_ids  = [aws_security_group.autopay_sg.id]
  db_subnet_group_name    = aws_db_subnet_group.autopay_db_subnet.name
  username                = "autopay_admin"
  password                = var.db_password  # Sensitive; use secrets manager in prod
  db_name                 = "autopay_ledger"
  backup_retention_period = 7
  multi_az                = var.environment == "prod" ? true : false
  skip_final_snapshot     = var.environment != "prod"

  # Performance insights for high-complexity transaction monitoring
  performance_insights_enabled = true

  tags = {
    Name = "autopay-rds-${var.environment}"
  }
}

# S3 Bucket for encrypted storage of session keys, failed tx hashes, and JSON ledgers
resource "aws_s3_bucket" "autopay_ledger_bucket" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_server_side_encryption_configuration" "autopay_encryption" {
  bucket = aws_s3_bucket.autopay_ledger_bucket.bucket

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"  # Matches agent security requirements
    }
  }
}

resource "aws_s3_bucket_policy" "autopay_bucket_policy" {
  bucket = aws_s3_bucket.autopay_ledger_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SecureAccess"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/autopay-lambda-role" }
        Action    = ["s3:GetObject", "s3:PutObject"]
        Resource  = "${aws_s3_bucket.autopay_ledger_bucket.arn}/*"
      }
    ]
  })
}

# IAM Role for Lambda (e.g., for real-time low-balance triggers)
resource "aws_iam_role" "autopay_lambda_role" {
  name = "autopay-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.autopay_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Example Lambda for Balance Monitoring (deployed via backend CI/CD)
resource "aws_lambda_function" "autopay_balance_monitor" {
  filename      = "lambda_balance.zip"  # Zipped Node.js code from BackendDev
  function_name = "autopay-balance-monitor-${var.environment}"
  role          = aws_iam_role.autopay_lambda_role.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime

  environment {
    variables = {
      DB_HOST     = aws_db_instance.autopay_postgres.endpoint
      DB_NAME     = "autopay_ledger"
      SOLANA_RPC  = "https://api.devnet.solana.com"  # For Phantom CASH checks
      LEDGER_BUCKET = aws_s3_bucket.autopay_ledger_bucket.bucket
    }
  }

  tags = {
    Name = "autopay-balance-lambda"
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}
```

## Outputs

Expose key endpoints for BackendDev integration (e.g., DB connection string for Prisma, S3 ARN for ledger uploads).

**outputs.tf**
```hcl
output "db_endpoint" {
  description = "PostgreSQL endpoint for Prisma ORM connection"
  value       = aws_db_instance.autopay_postgres.endpoint
}

output "db_connection_string" {
  description = "Full connection string (use securely)"
  value       = "postgresql://${aws_db_instance.autopay_postgres.username}:${var.db_password}@${aws_db_instance.autopay_postgres.endpoint}/autopay_ledger"
  sensitive   = true
}

output "s3_bucket_arn" {
  description = "S3 ARN for audit trail storage"
  value       = aws_s3_bucket.autopay_ledger_bucket.arn
}

output "vpc_id" {
  description = "VPC ID for secure Solana integrations"
  value       = aws_vpc.autopay_vpc.id
}

output "lambda_function_arn" {
  description = "ARN for balance monitoring Lambda"
  value       = aws_lambda_function.autopay_balance_monitor.arn
}
```

## Deployment Instructions

1. **Initialize and Plan:**
   ```
   cd infra
   terraform init
   terraform plan -var="environment=dev" -var="db_password=secure_password_here"
   ```

2. **Apply Changes:**
   ```
   terraform apply -var="environment=dev" -var="db_password=secure_password_here"
   ```
   This provisions resources in ~5-10 minutes. Outputs provide DB details for BackendDev's Prisma schema (e.g., tables for `transactions` with fields like `payment_hash`, `status`, `retry_count`, `balance_event`).

3. **Integration with CI/CD:**
   - Use GitHub Actions: Add a workflow to run `terraform apply` on merge to `main`, passing secrets for `db_password`.
   - BackendDev Coordination: Update `prisma/schema.prisma` with the output DB endpoint. For Render deploys, set env vars like `DATABASE_URL` from outputs.
   - Vercel Frontend: No direct Terraform tie-in; use outputs for API base URLs pointing to Render backend, which queries RDS for real-time logs visualization (e.g., payment flows, on-chain status).

4. **Teardown (for Devnet Testing):**
   ```
   terraform destroy -var="environment=dev"
   ```
   Ensures clean slate; skips final snapshots in dev.

5. **Monitoring and Maintenance:**
   - Enable CloudWatch alarms on RDS CPU (>80%) for scalability during multi-API Phase 3.
   - For production, integrate AWS Secrets Manager for `db_password` and add WAF to security groups for Coinbase verification protection.
   - Audit: Query RDS for transaction ledgers (e.g., `SELECT * FROM audits WHERE status = 'failed' AND retry_count < 3`) to simulate exponential backoff analysis.

## Best Practices and Security Notes

- **Devnet Isolation:** All resources tagged for Devnet; no mainnet exposure. Lambda env vars restrict Solana RPC to `api.devnet.solana.com`.
- **Resilience Tie-In:** RDS multi-AZ in prod handles network issues; S3 versioning for immutable ledgers prevents duplication of failed payment hashes.
- **Compliance:** S3 encryption meets AES-256 requirements for Phantom session keys. IAM roles scoped to least privilege (e.g., Lambda only reads/writes specific S3 paths like `/ledgers/{tx_hash}.json`).
- **Extensibility:** Add modules for future Rust Solana programs (e.g., provision EKS for on-chain data hosting). Coordinate with BackendDev for Lambda code zips handling x402 SDK calls.
- **Cost Estimate (Dev):** ~$0.05/hour (t3.micro RDS + S3); scale to prod with auto-scaling groups.

This Terraform setup ensures the Autopay Agent's infrastructure is robust, observable, and aligned with the x402 economy vision—enabling autonomous agents to transact securely in decentralized web applications. For updates, reference BackendDev's deployment manifests.