provider "aws" {
  region = var.region
}

# ------------------------
# SECURITY GROUP
# ------------------------
resource "aws_security_group" "bank_sg" {
  name        = "banking-app-sg"
  description = "Allow SSH and Banking App traffic"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  ingress {
    description = "Bank App"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = "Cloud-Native-Banking"
  }
}

# ------------------------
# EC2 INSTANCE
# ------------------------
resource "aws_instance" "bank_ec2" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = [
    aws_security_group.bank_sg.id
  ]

  tags = {
    Name = "Banking-App-Terraform"
  }
}

# ------------------------
# UBUNTU AMI
# ------------------------
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*"]
  }
}
