variable "region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  default     = "t3.micro"
}

variable "key_name" {
  description = "Existing EC2 Key Pair name"
  type        = string
}

variable "ssh_cidr" {
  description = "Your IP for SSH access"
  type        = string
}
