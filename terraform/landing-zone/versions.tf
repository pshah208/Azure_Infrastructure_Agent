terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.50"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-tfstate-mgmt-eastus-001"
    storage_account_name = "sttfstatemgmteastus001"
    container_name       = "tfstate"
    key                  = "landing-zone/terraform.tfstate"
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id

  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
  }

  default_tags {
    tags = {
      Environment = var.environment
      CostCenter  = var.cost_center
      Owner       = var.owner
      CreatedBy   = "Terraform"
      ManagedBy   = "IaC"
    }
  }
}

provider "azuread" {
  tenant_id = var.tenant_id
}
