
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { auth } from '@/lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

const registerSchema = z.object({
    email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
    password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});


export default function LoginPage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);


  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '' },
  });


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoading(false);
      if (currentUser) {
        setUser(currentUser);
        router.push('/');
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast({ title: "Sucesso!", description: "Login com Google realizado com sucesso." });
      router.push('/');
    } catch (error: any) {
      console.error("Google Sign-In Error:", error);
      toast({ variant: "destructive", title: "Erro de Login", description: error.message });
    }
  };

  const handleEmailLogin = async (data: z.infer<typeof loginSchema>) => {
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: "Sucesso!", description: "Login realizado com sucesso." });
      router.push('/');
    } catch (error: any) {
       console.error("Email/Password Sign-In Error:", error);
       toast({ variant: "destructive", title: "Erro de Login", description: "Credenciais inválidas. Verifique seu e-mail e senha." });
    }
  };
  
  const handleEmailRegister = async (data: z.infer<typeof registerSchema>) => {
    try {
      await createUserWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: "Conta Criada!", description: "Sua conta foi criada com sucesso." });
      router.push('/');
    } catch (error: any) {
        console.error("Registration Error:", error);
        toast({ variant: "destructive", title: "Erro no Registro", description: error.message });
    }
  };

  const Spinner = ({ className = "w-6 h-6" }) => (
    <div className="flex justify-center items-center">
        <span className={`inline-block ${className} rounded-full border-4 border-slate-200 border-t-slate-600 animate-spin`} aria-hidden />
    </div>
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Spinner /></div>;
  }
  
  if (user) return null; // Don't render anything if user is already logged in and redirecting

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Acesse sua Conta</CardTitle>
          <CardDescription>Bem-vindo de volta! Escolha seu método de login preferido.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="register">Registrar</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleEmailLogin)} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email-login">Email</Label>
                  <Input id="email-login" type="email" placeholder="seu@email.com" {...loginForm.register('email')} />
                  {loginForm.formState.errors.email && <p className="text-xs text-red-600">{loginForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-login">Senha</Label>
                  <Input id="password-login" type="password" {...loginForm.register('password')} />
                   {loginForm.formState.errors.password && <p className="text-xs text-red-600">{loginForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
                    {loginForm.formState.isSubmitting ? <Spinner className="w-4 h-4" /> : 'Entrar com Email'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={registerForm.handleSubmit(handleEmailRegister)} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email-register">Email</Label>
                  <Input id="email-register" type="email" placeholder="seu@email.com" {...registerForm.register('email')} />
                   {registerForm.formState.errors.email && <p className="text-xs text-red-600">{registerForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-register">Senha</Label>
                  <Input id="password-register" type="password" {...registerForm.register('password')} />
                   {registerForm.formState.errors.password && <p className="text-xs text-red-600">{registerForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={registerForm.formState.isSubmitting}>
                   {registerForm.formState.isSubmitting ? <Spinner className="w-4 h-4" /> : 'Criar Conta'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Ou continue com
              </span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
              <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"></path>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 7.585l6.19 5.238C42.018 35.836 44 30.138 44 24c0-1.341-.138-2.65-.389-3.917z"></path>
            </svg>
            Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

    