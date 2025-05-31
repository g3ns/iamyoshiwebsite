// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize animations
    initAnimations();
    
    // Add scroll animations
    window.addEventListener('scroll', revealOnScroll);
    
    // Add hover effects for social cards
    addSocialCardEffects();
});

// Initialize page load animations
function initAnimations() {
    // Add a class to the body when page is loaded
    document.body.classList.add('loaded');
    
    // Animate hero section elements with a slight delay
    setTimeout(() => {
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            heroContent.style.opacity = 1;
        }
    }, 300);
}

// Reveal elements on scroll
function revealOnScroll() {
    const elements = document.querySelectorAll('.social-card');
    const windowHeight = window.innerHeight;
    
    elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;
        
        if (elementTop < windowHeight - elementVisible) {
            element.classList.add('visible');
        }
    });
}

// Add hover effects for social cards
function addSocialCardEffects() {
    const socialCards = document.querySelectorAll('.social-card');
    
    socialCards.forEach(card => {
        // Mouse enter effect
        card.addEventListener('mouseenter', function() {
            // Scale up the icon slightly
            const icon = this.querySelector('.social-icon');
            if (icon) {
                icon.style.transform = 'scale(1.1)';
                icon.style.transition = 'transform 0.3s ease';
            }
            
            // Add a subtle background color change
            this.style.backgroundColor = '#f8f8ff';
        });
        
        // Mouse leave effect
        card.addEventListener('mouseleave', function() {
            // Reset the icon
            const icon = this.querySelector('.social-icon');
            if (icon) {
                icon.style.transform = 'scale(1)';
            }
            
            // Reset the background color
            this.style.backgroundColor = 'white';
        });
        
        // Add click ripple effect
        card.addEventListener('click', function(e) {
            // Create ripple element
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            this.appendChild(ripple);
            
            // Position the ripple
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size/2}px`;
            ripple.style.top = `${e.clientY - rect.top - size/2}px`;
            
            // Remove ripple after animation
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Add parallax effect to hero section
window.addEventListener('scroll', function() {
    const scrollPosition = window.scrollY;
    const hero = document.querySelector('.hero');
    
    if (hero) {
        hero.style.backgroundPositionY = `${scrollPosition * 0.5}px`;
    }
});

// Add typing animation to a text element (unused but available for future enhancement)
function typeWriter(element, text, speed = 100) {
    let i = 0;
    element.innerHTML = '';
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

