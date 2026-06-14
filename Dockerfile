FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Create logs directory
RUN mkdir -p logs && chown node:node logs

# Use non-root user
USER node

EXPOSE 4040

CMD [ "npm", "start" ]
