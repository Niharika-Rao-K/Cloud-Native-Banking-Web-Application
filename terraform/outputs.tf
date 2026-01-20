output "ec2_public_ip" {
  description = "Public IP of the Banking EC2 instance"
  value       = aws_instance.bank_ec2.public_ip
}
