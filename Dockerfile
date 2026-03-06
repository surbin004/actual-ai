FROM node:22.14-alpine3.21

# Step 1: Update NPM and install system dependencies
# This silences the "npm notice" and ensures modern package handling
RUN npm install -g npm@latest && \
    apk add --no-cache python3 make g++ 

# Step 2: Set up the working directory
WORKDIR /opt/node_app

# Step 3: Copy only package files first
# (This makes builds faster by caching layers)
COPY --chown=node:node package*.json ./

# Step 4: Install ALL dependencies
RUN npm install

# Step 5: Copy the rest of the source code
COPY --chown=node:node . .

# Step 6: Build the TypeScript into Javascript
# Note: Ensure the TS2353 'flagged' fix is in your app.ts before running this
RUN npm run build

# Step 7: Create the data directory for Actual Budget metadata
RUN mkdir -p /opt/node_app/data && chown -R node:node /opt/node_app/data

# Step 8: Switch to non-root user for security
USER node

# Step 9: Define the start command
CMD [ "npm", "run", "prod" ]
