# Use nginx:alpine as the base image
FROM nginx:alpine

# Copy website files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# nginx will start automatically when the container starts
# using the default CMD from the nginx:alpine image

