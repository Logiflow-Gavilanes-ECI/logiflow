terraform {
  backend "azurerm" {
    resource_group_name  = "logiflow-tfstate-rg"
    storage_account_name = "logiflowtfstate0c0f33"
    container_name       = "tfstate"
    key                  = "logiflow-deploy.tfstate"
  }
}
