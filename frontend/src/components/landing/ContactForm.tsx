import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/animations';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ContactFormData {
  name: string;
  email: string;
  role: string;
  message: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_KEY || '';
const IS_FORM_CONFIGURED = Boolean(WEB3FORMS_KEY);

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<FormStatus>('idle');
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    if (!IS_FORM_CONFIGURED) return;
    setStatus('submitting');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: WEB3FORMS_KEY, ...data }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const result = await response.json();
      if (result.success) {
        setStatus('success');
        reset();
      } else {
        setStatus('error');
      }
    } catch {
      clearTimeout(timeout);
      setStatus('error');
    }
  };

  // Field cascade entrance animation
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const form = formRef.current;
      if (!form) return;

      const fields = form.querySelectorAll('.form-group, .form-row, .form-submit');
      gsap.set(fields, { y: 12, opacity: 0 });
      gsap.to(fields, {
        y: 0,
        opacity: 1,
        duration: 0.35,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: form,
          start: 'top 85%',
          once: true,
        },
      });
    },
    { scope: formRef },
  );

  return (
    <section className="contact-section" id="contact">
      <div className="contact-inner">
        <p className="section-label reveal">Get in Touch</p>
        <h2 className="contact-heading reveal">
          <em>Say</em> hello
        </h2>

        <form className="contact-form" ref={formRef} onSubmit={handleSubmit(onSubmit)}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contact-name" className="form-label">
                Name
              </label>
              <input
                type="text"
                id="contact-name"
                className="form-input"
                placeholder="Your name"
                {...register('name', { required: true })}
              />
              {errors.name && (
                <span role="alert" style={{ color: 'var(--color-gold)', fontSize: 12 }}>Name is required</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="contact-email" className="form-label">
                Email
              </label>
              <input
                type="email"
                id="contact-email"
                className="form-input"
                placeholder="you@university.edu"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Please enter a valid email address',
                  },
                })}
              />
              {errors.email && (
                <span role="alert" style={{ color: 'var(--color-gold)', fontSize: 12 }}>
                  {errors.email.message || 'Email is required'}
                </span>
              )}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="contact-role" className="form-label">
              Role
            </label>
            <select
              id="contact-role"
              className="form-select"
              defaultValue=""
              {...register('role')}
            >
              <option value="" disabled>
                Select your role
              </option>
              <option value="Student">Student</option>
              <option value="Faculty">Faculty</option>
              <option value="Researcher">Researcher</option>
              <option value="Industry Professional">Industry Professional</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="contact-message" className="form-label">
              Message
            </label>
            <textarea
              id="contact-message"
              className="form-textarea"
              placeholder="What are you working on?"
              rows={4}
              {...register('message', { required: true })}
            />
            {errors.message && (
              <span role="alert" style={{ color: 'var(--color-gold)', fontSize: 12 }}>Message is required</span>
            )}
          </div>

          {status === 'success' ? (
            <p
              role="alert"
              style={{
                color: 'var(--color-teal)',
                fontWeight: 500,
                textAlign: 'center',
                fontSize: 'var(--fs-body)',
              }}
            >
              Message sent!
            </p>
          ) : (
            <button
              type="submit"
              className="form-submit"
              disabled={status === 'submitting' || !IS_FORM_CONFIGURED}
            >
              {!IS_FORM_CONFIGURED
                ? 'Coming Soon'
                : status === 'submitting'
                  ? 'Sending...'
                  : 'Send Message'}
            </button>
          )}

          {status === 'error' && (
            <p
              role="alert"
              style={{
                color: 'var(--color-gold)',
                fontSize: 'var(--fs-small)',
                textAlign: 'center',
              }}
            >
              Something went wrong. Please try again.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
