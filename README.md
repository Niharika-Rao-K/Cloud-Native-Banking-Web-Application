# Cloud-Native-Banking-Web-Application

A secure, cloud-native banking web application deployed on **AWS**, demonstrating **infrastructure automation, CI/CD pipelines, monitoring, security, and serverless integration**.

---

## 🚀 Project Overview

The **Cloud-Native Banking Web Application** is a real-world banking system designed and deployed using modern cloud and DevOps practices.

The project started with a local **SQLite** database and was later migrated to **AWS RDS (MySQL)**. The application is hosted on **AWS EC2**, with transaction auditing implemented using **AWS Lambda and API Gateway**, and centralized logging via **CloudWatch**.

This project aligns with enterprise-grade cloud infrastructure and deployment standards.

---

## 🎯 Objectives

- Deploy a production-style web application on AWS  
- Migrate from local database to managed cloud database  
- Automate infrastructure using **Terraform**  
- Implement **CI/CD** using GitHub Actions  
- Enable centralized monitoring and logging  
- Integrate serverless components for auditing  

---

## 🛠️ Technology Stack

### Application Layer
- Frontend: HTML, CSS  
- Backend: Node.js (Express)  
- Database: SQLite → **AWS RDS (MySQL)**  

### Cloud & DevOps
- **AWS EC2** – Application hosting  
- **AWS RDS** – Managed relational database  
- **AWS Lambda** – Transaction audit logging  
- **Amazon API Gateway** – Serverless API  
- **AWS CloudWatch** – Logs and monitoring  
- **Terraform** – Infrastructure as Code  
- **GitHub Actions** – CI/CD automation  

---

## 🏗️ System Architecture

The application follows a **cloud-native architecture**:

- Web application deployed on **EC2**
- Database hosted on **RDS**
- Transaction events sent to **API Gateway**
- API Gateway triggers **Lambda**
- Lambda writes audit logs to **CloudWatch**

Architecture diagrams and screenshots are included in the documentation folder.

---

## 📦 Infrastructure as Code (Terraform)

Terraform is used to provision and manage:

- EC2 instances  
- Security groups  
- Networking and access rules  

This ensures **repeatable, version-controlled, and automated infrastructure deployment**.

---

## 🔁 CI/CD Pipeline

A **GitHub Actions** pipeline automates:

- Code build and validation  
- Secure deployment to EC2  
- Application restart after updates  

This enables continuous delivery with minimal manual intervention.

---

## 📊 Monitoring & Logging

- Application logs monitored using **CloudWatch**
- Lambda-based transaction audit logs stored in CloudWatch
- Full visibility into system operations and transactions

---

## ⚡ Serverless Integration

**AWS Lambda** is used for transaction auditing, triggered via **API Gateway**.  
This design allows independent scaling and decoupled logging from the core application.

---

## 📂 Repository Structure

Cloud-Native-Banking-Web-Application/

├── terraform/ # Infrastructure as Code

├── .github/workflows/ # CI/CD pipeline (GitHub Actions)

├── views/ # Frontend HTML files

├── public/ # Static assets

├── server.js # Node.js backend

├── index.mjs # Lambda audit function

└── README.md


---

## 🔮 Future Enhancements

- Kubernetes-based microservices deployment  
- Advanced security using IAM roles and WAF  
- Big data analytics on transaction logs  
- Machine learning-based fraud detection  

---

## 👩‍💻 Author

**Niharika Rao K**  
*Cloud Infrastructure, Automation & Deployment Ecosystem Project*
