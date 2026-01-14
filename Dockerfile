# Step 3a: Use a Node.js base image
FROM node:18

# Step 3b: Set working directory inside container
WORKDIR /app

# Step 3c: Copy package.json and package-lock.json first
# This helps Docker cache dependencies
COPY package*.json ./

# Step 3d: Install app dependencies
RUN npm install

# Step 3e: Copy the rest of your app's source code
COPY . .

# Step 3f: Expose the port your app runs on
EXPOSE 3000

# Step 3g: Command to run the app
CMD ["node", "server.js"]
