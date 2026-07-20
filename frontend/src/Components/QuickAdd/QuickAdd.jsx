import { useEffect, useState } from "react";
import './QuickAdd.css'

function QuickAdd(){
    const [orderNum, setOrderNum] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [lastSubmittedData, setLastSubmittedData] = useState(null);

    //Clear data after 30 seconds
    useEffect(() => {
        if(!error) return;

        const timer = setTimeout(()=>{
            setError("");
        }, 30000)

        return () => clearTimeout(timer);
    }, [error]);

    useEffect(() => {
        if(!lastSubmittedData) return;

        const timer = setTimeout(()=>{
            setLastSubmittedData("");
        }, 30000)

        return () => clearTimeout(timer);
    }, [lastSubmittedData]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");
        setResult(null);
        if(orderNum.trim() === "" && status === ""){
            setError("Please set the order # and status.")
            return;
        }
        else if(orderNum.trim() === ""){
            setError("An order number is required.")
            return;
        }
        else if(status === ""){
            setError("The selected order status is invalid.");
            return;
        }
        try{
            const responseData = await fetch("/api/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({orderNumber: orderNum, status})
            })

            const parsedData = await responseData.json();
            console.log(parsedData)
            if(!responseData.ok){
                setError(parsedData.error || "Something went wrong");
                return;
            }

            setLastSubmittedData(parsedData);
        }
        catch(err){
            setError(err.message || "Unable to connect to the server.");
        }
    }
    return(
        <>
            <form className="quickAddBox" onSubmit={handleSubmit}>
                <input value={orderNum} type="text" onChange={e=>setOrderNum(e.target.value)} placeholder="Add a Order #"/>
                <select
                    value={status}
                    onChange={e=>setStatus(e.target.value)}>
                    <option value=""></option>
                    <option value={"Order Received"}>Order Received</option>
                    <option value={"Shipping"}>Shipping</option>
                    <option value={"Shipped"}>Shipped</option>
                    <option value={"Out for Delivery"}>Out for Delivery</option>
                    <option value={"Delivered"}>Delivered</option>
                </select>
                <button type="Submit">Create order</button>
            </form>
            {error && <p className="errorMessage">ERROR: {error}</p>}
            {!error && lastSubmittedData && <p>Created Order: ID: {lastSubmittedData.orderNumber}, Tracking Number: {lastSubmittedData.trackingNumber} Status: {lastSubmittedData.status}</p>}

        </>
    )
}

export default QuickAdd;