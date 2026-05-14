terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.115"
    }
  }

  # Remote state in Azure Storage. The storage account must exist before
  # `terraform init` (chicken-and-egg). See README for the one-time `az`
  # commands that create it.
  backend "azurerm" {
    resource_group_name  = "logiflow-tfstate-rg"
    storage_account_name = "logiflowtfstate0c0f33"
    container_name       = "tfstate"
    key                  = "logiflow-azure.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
